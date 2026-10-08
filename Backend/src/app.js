import express from "express";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { db } from "./database.js";
import { sendOrderNotifications, sendReservationNotifications } from "./order-notifications.js";
import { getAvailableTables, reservationDurationMinutes } from "./reservation-availability.js";
import { beverageGroups, isValidMenuPlacement, menuCategories } from "./menu-categories.js";
import {
  auditStaffActivity,
  clearSession,
  requireCustomer,
  requireManager,
  requireStaff,
  requireUser,
  safeUser,
  setSession,
} from "./auth.js";

export const app = express();

const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
const authenticationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again in 15 minutes." },
});
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many order requests. Please try again in 15 minutes." },
});
const reservationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many reservation requests. Please try again in 15 minutes." },
});
const applicationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many application submissions. Please try again later." },
});

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.post("/api/careers/applications", applicationLimiter, express.json({ limit: "7mb" }), (request, response) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    desiredPosition,
    message = "",
    resumeName,
    resumeType,
    resumeBase64,
    consent,
  } = request.body ?? {};
  const resumeFormats = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const safeResumeName = typeof resumeName === "string"
    ? resumeName.trim().replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(-120)
    : "";
  const resumeExtension = safeResumeName.match(/\.(pdf|docx?)$/i)?.[0]?.toLowerCase();
  const resumeBuffer = typeof resumeBase64 === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(resumeBase64)
    ? Buffer.from(resumeBase64, "base64")
    : null;
  if (
    !validText(firstName, 1, 80) ||
    !validText(lastName, 1, 80) ||
    typeof email !== "string" ||
    email.length > 254 ||
    !emailPattern.test(email.trim()) ||
    !validText(phone, 7, 30) ||
    !jobPositionTitles.includes(desiredPosition) ||
    typeof message !== "string" ||
    message.trim().length > 2000 ||
    typeof consent !== "boolean" ||
    !consent ||
    !resumeExtension ||
    resumeType !== resumeFormats[resumeExtension] ||
    !resumeBuffer ||
    resumeBuffer.length === 0 ||
    resumeBuffer.length > 5 * 1024 * 1024 ||
    resumeBuffer.toString("base64").replace(/=+$/, "") !== resumeBase64.replace(/=+$/, "")
  ) {
    return response.status(400).json({ error: "Complete all required fields, accept the privacy terms, and attach a PDF, DOC, or DOCX CV no larger than 5 MB." });
  }

  const result = db.prepare(`
    INSERT INTO job_applications (
      first_name, last_name, email, phone, desired_position, message,
      resume_name, resume_type, resume_data, consent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    firstName.trim(),
    lastName.trim(),
    email.trim().toLowerCase(),
    phone.trim(),
    desiredPosition,
    message.trim(),
    safeResumeName,
    resumeType,
    resumeBuffer,
  );
  return response.status(201).json({ applicationNumber: `OP-${result.lastInsertRowid}` });
});
app.use(express.json({ limit: "32kb" }));

const publicMenuItem = (item) => ({
  id: item.id,
  name: item.name,
  description: item.description,
  category: item.category,
  subcategory: item.subcategory,
  beverageGroup: item.beverage_group,
  price: item.price_pesewas / 100,
  imageUrl: item.image_url,
  badge: item.badge,
  available: Boolean(item.available) && (item.stock_quantity === null || item.stock_quantity > 0),
  referenceUrl: item.source_url,
});
const staffMenuItem = (item) => ({
  ...publicMenuItem(item),
  listedAvailable: Boolean(item.available),
  stockQuantity: item.stock_quantity,
  lowStockThreshold: item.low_stock_threshold,
});

const menuItems = db.prepare(`
  SELECT * FROM menu_items
  WHERE available = 1 AND (stock_quantity IS NULL OR stock_quantity > 0)
  ORDER BY id
`);
const validText = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
const validImageUrl = (value) => {
  if (typeof value !== "string" || value.length > 1000) return false;
  if (value.startsWith("/")) return !value.startsWith("//") && !value.split("/").includes("..");
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const normalizeMenuItemName = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
const menuItemExists = (name, excludeId = null) => {
  const query = excludeId === null
    ? "SELECT id FROM menu_items WHERE LOWER(name) = ?"
    : "SELECT id FROM menu_items WHERE LOWER(name) = ? AND id != ?";
  const params = excludeId === null ? [normalizeMenuItemName(name)] : [normalizeMenuItemName(name), excludeId];
  return db.prepare(query).get(...params);
};
const getMenuPlacementError = (category, beverageGroup, subcategory) => {
  if (!menuCategories.includes(category)) return "Choose a valid menu category.";
  if (!validText(subcategory, 2, 40)) return "Enter a valid dish or drink subsection.";
  if (category !== "Drinks" && beverageGroup) {
    return "This item is placed in the wrong menu category. Remove the drink category or move it to Drinks.";
  }
  if (category === "Drinks") {
    if (!beverageGroup || !beverageGroups.includes(beverageGroup)) {
      return "Choose a valid drink category for drinks in the menu.";
    }
    if (["Beer", "Wine", "Spirits & Liquors", "Cocktails"].includes(subcategory) && beverageGroup !== "Alcoholic Beverages") {
      return "Alcoholic menu items must be assigned to the Alcoholic Beverages group.";
    }
    if (["Hot Drinks", "Cold & Soft Drinks", "Juices & Smoothies"].includes(subcategory) && beverageGroup !== "Non-Alcoholic Beverages") {
      return "Non-alcoholic menu items must be assigned to the Non-Alcoholic Beverages group.";
    }
  }
  return "";
};
const orderStatuses = ["received", "preparing", "ready", "completed", "cancelled"];
const bookingStatuses = ["requested", "confirmed", "seated", "completed", "cancelled"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const jobPositionTitles = [
  "Dishwasher",
  "Dining Room Manager",
  "Pizza Cook",
  "Delivery Driver",
  "Host",
  "Dining Room Support",
  "Bartender",
  "Server",
  "Line Cook",
  "Greeter",
  "Food Runner",
];
const minimumPasswordLength = 12;
const maxMenuStock = 100000;
const normalizedPhone = (phone) => phone.replace(/[^\d+]/g, "");
const validBookingDate = (date) =>
  typeof date === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
const validBookingTime = (time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const validReservationHours = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  const startMinutes = hours * 60 + minutes;
  return startMinutes >= 11 * 60 && startMinutes + reservationDurationMinutes <= 22 * 60;
};
const bookingStartsInFuture = (date, time) => Date.parse(`${date}T${time}:00Z`) >= Date.now();

app.post("/api/auth/register", authenticationLimiter, async (request, response) => {
  const { name, email, phone, password } = request.body ?? {};
  if (
    !validText(name, 2, 80) ||
    typeof email !== "string" ||
    email.length > 254 ||
    !emailPattern.test(email.trim()) ||
    !validText(phone, 7, 30) ||
    typeof password !== "string" ||
    password.length < minimumPasswordLength ||
    password.length > 128
  ) {
    return response.status(400).json({ error: "Enter your name, a valid email and phone, and a password with at least 12 characters." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, role)
      VALUES (?, ?, ?, ?, 'customer')
    `).run(name.trim(), email.trim().toLowerCase(), phone.trim(), passwordHash);
    const user = db.prepare("SELECT id, name, email, phone, role FROM users WHERE id = ?").get(result.lastInsertRowid);
    setSession(response, user.id);
    return response.status(201).json({ user });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    throw error;
  }
});

app.post("/api/auth/login", authenticationLimiter, async (request, response) => {
  const { email, password } = request.body ?? {};
  if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || password.length > 128) {
    return response.status(400).json({ error: "Enter your email address and password." });
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email.trim().toLowerCase());
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    return response.status(401).json({ error: "The email or password is incorrect." });
  }
  setSession(response, user.id);
  return response.json({ user: safeUser(user) });
});

app.get("/api/auth/me", requireUser, (request, response) => response.json({ user: request.user }));

app.post("/api/auth/logout", (request, response) => {
  clearSession(request, response);
  return response.status(204).end();
});

function readOrders() {
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC, id DESC").all();
  const orderItems = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id");
  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    phone: order.phone,
    orderType: order.order_type,
    total: order.total_pesewas / 100,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: orderItems.all(order.id).map((item) => ({
      name: item.item_name,
      quantity: item.quantity,
      unitPrice: item.unit_price_pesewas / 100,
    })),
  }));
}

function readTrackedOrder(order) {
  const items = db.prepare(`
    SELECT item_name, quantity, unit_price_pesewas
    FROM order_items
    WHERE order_id = ?
    ORDER BY id
  `).all(order.id);
  return {
    orderNumber: order.order_number,
    status: order.status,
    orderType: order.order_type,
    total: order.total_pesewas / 100,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: items.map((item) => ({
      name: item.item_name,
      quantity: item.quantity,
      unitPrice: item.unit_price_pesewas / 100,
    })),
  };
}

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
app.get("/api/menu", (_request, response) =>
  response.json(
    menuItems.all()
      .map(publicMenuItem)
      .sort((first, second) =>
        menuCategories.indexOf(first.category) - menuCategories.indexOf(second.category) ||
        first.id - second.id,
      ),
  ),
);

app.post("/api/order-tracking", orderLimiter, (request, response) => {
  const { orderNumber, phone } = request.body ?? {};
  if (
    typeof orderNumber !== "string" ||
    !/^GH-[A-F0-9]{8,32}$/i.test(orderNumber.trim()) ||
    !validText(phone, 7, 30)
  ) {
    return response.status(400).json({ error: "Enter the order number and phone number used at checkout." });
  }
  const order = db.prepare("SELECT * FROM orders WHERE order_number = ? COLLATE NOCASE").get(orderNumber.trim());
  if (!order || normalizedPhone(order.phone) !== normalizedPhone(phone.trim())) {
    return response.status(404).json({ error: "We couldn't find an order with those details." });
  }
  return response.json(readTrackedOrder(order));
});

app.post("/api/orders", orderLimiter, (request, response) => {
  const { customerName, customerEmail, phone, orderType, items } = request.body ?? {};
  if (
    !validText(customerName, 2, 80) ||
    typeof customerEmail !== "string" ||
    customerEmail.length > 254 ||
    !emailPattern.test(customerEmail.trim()) ||
    !validText(phone, 7, 30) ||
    !["pickup", "dine-in"].includes(orderType) ||
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > 30
  ) {
    return response.status(400).json({ error: "Enter your name, valid email and phone number, order type and at least one item." });
  }

  const quantities = new Map();
  for (const item of items) {
    if (!Number.isInteger(item?.id) || !Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 20) {
      return response.status(400).json({ error: "Each order item needs a valid menu item and quantity between 1 and 20." });
    }
    quantities.set(item.id, (quantities.get(item.id) || 0) + item.quantity);
  }
  if ([...quantities.values()].some((quantity) => quantity > 20)) {
    return response.status(400).json({ error: "An item quantity cannot exceed 20." });
  }

  const requestedItems = [...quantities].map(([id, quantity]) => ({ id, quantity }));
  const findItem = db.prepare(`
    SELECT * FROM menu_items
    WHERE id = ? AND available = 1 AND (stock_quantity IS NULL OR stock_quantity > 0)
  `);
  const orderTransaction = db.transaction(() => {
    const resolvedItems = requestedItems.map(({ id, quantity }) => {
      const item = findItem.get(id);
      if (!item) throw new Error("MENU_ITEM_UNAVAILABLE");
      if (item.stock_quantity !== null && item.stock_quantity < quantity) {
        throw new Error("MENU_ITEM_STOCK_INSUFFICIENT");
      }
      return { item, quantity };
    });
    const decrementStock = db.prepare(`
      UPDATE menu_items
      SET stock_quantity = stock_quantity - ?
      WHERE id = ? AND stock_quantity IS NOT NULL AND stock_quantity >= ?
    `);
    for (const { item, quantity } of resolvedItems) {
      if (item.stock_quantity !== null && decrementStock.run(quantity, item.id, quantity).changes !== 1) {
        throw new Error("MENU_ITEM_STOCK_INSUFFICIENT");
      }
    }
    const totalPesewas = resolvedItems.reduce(
      (total, { item, quantity }) => total + item.price_pesewas * quantity,
      0,
    );
    const orderNumber = `GH-${randomBytes(16).toString("hex").toUpperCase()}`;
    const order = db.prepare(`
      INSERT INTO orders (order_number, customer_name, customer_email, phone, order_type, total_pesewas)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(orderNumber, customerName.trim(), customerEmail.trim().toLowerCase(), phone.trim(), orderType, totalPesewas);
    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_pesewas, quantity)
      VALUES (?, ?, ?, ?, ?)
    `);
    resolvedItems.forEach(({ item, quantity }) =>
      insertOrderItem.run(order.lastInsertRowid, item.id, item.name, item.price_pesewas, quantity),
    );
    return {
      orderNumber,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase(),
      phone: phone.trim(),
      orderType,
      total: totalPesewas / 100,
      status: "received",
      createdAt: new Date().toISOString(),
      items: resolvedItems.map(({ item, quantity }) => ({
        name: item.name,
        quantity,
        unitPrice: item.price_pesewas / 100,
      })),
    };
  });

  try {
    const order = orderTransaction();
    return sendOrderNotifications(order).then((notifications) =>
      response.status(201).json({ ...order, notifications }),
    );
  } catch (error) {
    if (["MENU_ITEM_UNAVAILABLE", "MENU_ITEM_STOCK_INSUFFICIENT"].includes(error.message)) {
      return response.status(409).json({ error: "A selected menu item is unavailable or there isn't enough stock. Refresh the menu and try again." });
    }
    throw error;
  }
});

app.get("/api/reservation-availability", (request, response) => {
  const { date, time } = request.query;
  const partySize = Number(request.query.partySize);
  if (
    !validBookingDate(date) ||
    !validBookingTime(time) ||
    !validReservationHours(time) ||
    !Number.isInteger(partySize) ||
    partySize < 1 ||
    partySize > 20
  ) {
    return response.status(400).json({ error: "Choose a valid date, time and party size." });
  }
  if (!bookingStartsInFuture(date, time)) {
    return response.status(400).json({ error: "Choose a reservation time in the future." });
  }
  const tables = getAvailableTables(date, time, partySize);
  return response.json({ date, time, partySize, durationMinutes: reservationDurationMinutes, tables });
});

app.post("/api/bookings", reservationLimiter, requireUser, requireCustomer, async (request, response) => {
  const { date, time, partySize, notes = "" } = request.body ?? {};
  if (
    !validBookingDate(date) ||
    !validBookingTime(time) ||
    !validReservationHours(time) ||
    !Number.isInteger(partySize) ||
    partySize < 1 ||
    partySize > 20 ||
    typeof notes !== "string" ||
    notes.length > 500
  ) {
    return response.status(400).json({ error: "Check your date, time, party size and notes." });
  }
  if (!bookingStartsInFuture(date, time)) {
    return response.status(400).json({ error: "Choose a reservation time in the future." });
  }
  if (getAvailableTables(date, time, partySize).length === 0) {
    return response.status(409).json({ error: "No tables are available for that time and party size. Please choose another time." });
  }

  const booking = db.prepare(`
    INSERT INTO bookings (customer_name, phone, booking_date, booking_time, party_size, notes, customer_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(request.user.name, request.user.phone, date, time, partySize, notes.trim(), request.user.id);

  const reservation = {
    id: Number(booking.lastInsertRowid),
    customerName: request.user.name,
    customerEmail: request.user.email,
    phone: request.user.phone,
    date,
    time,
    partySize,
    notes: notes.trim(),
    status: "requested",
    tableName: null,
  };
  const notifications = await sendReservationNotifications(reservation);
  return response.status(201).json({
    bookingId: reservation.id,
    status: "requested",
    message: "Your table request is in. We'll notify you when the team updates it.",
    notifications,
  });
});

app.get("/api/customer/reservations", requireUser, requireCustomer, (request, response) => {
  const reservations = db.prepare(`
    SELECT b.id, b.booking_date, b.booking_time, b.party_size, b.notes, b.status, t.name AS table_name
    FROM bookings b LEFT JOIN restaurant_tables t ON t.id = b.table_id
    WHERE b.customer_user_id = ?
    ORDER BY b.booking_date DESC, b.booking_time DESC
  `).all(request.user.id).map((booking) => ({
    id: booking.id,
    date: booking.booking_date,
    time: booking.booking_time,
    partySize: booking.party_size,
    notes: booking.notes,
    status: booking.status,
    tableName: booking.table_name,
  }));
  return response.json(reservations);
});

app.use("/api/staff", requireUser, requireStaff, auditStaffActivity);
app.use("/api/manager", requireUser, requireManager, auditStaffActivity);

app.get("/api/manager/summary", (_request, response) => {
  const today = new Date().toISOString().slice(0, 10);
  const ordersToday = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE date(created_at) = ?").get(today).count;
  const salesToday = db.prepare("SELECT COALESCE(SUM(total_pesewas), 0) AS total FROM orders WHERE date(created_at) = ? AND status != 'cancelled'").get(today).total;
  const activeTickets = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('received', 'preparing', 'ready')").get().count;
  const pendingBookings = db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE status = 'requested'").get().count;
  const occupiedTables = db.prepare("SELECT COUNT(*) AS count FROM restaurant_tables WHERE status = 'occupied'").get().count;
  const activeStaff = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'staff' AND active = 1").get().count;
  const activityCount = db.prepare("SELECT COUNT(*) AS count FROM activity_logs").get().count;
  return response.json({ ordersToday, salesToday: salesToday / 100, activeTickets, pendingBookings, occupiedTables, activeStaff, activityCount });
});

app.get("/api/manager/activities", (request, response) => {
  const requestedLimit = Number(request.query.limit);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 100;
  const rows = db.prepare(`
    SELECT id, actor_name AS actorName, actor_email AS actorEmail, action, entity, entity_id AS entityId, details, created_at AS createdAt
    FROM activity_logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
  return response.json(rows);
});

app.get("/api/manager/staff", (_request, response) => {
  const users = db.prepare(`
    SELECT id, name, email, role, active, created_at AS createdAt
    FROM users WHERE role IN ('staff', 'manager') ORDER BY role, name
  `).all().map((user) => ({ ...user, active: Boolean(user.active) }));
  return response.json(users);
});

app.get("/api/manager/applications", (_request, response) => {
  const applications = db.prepare(`
    SELECT id, first_name AS firstName, last_name AS lastName, email, phone,
      desired_position AS desiredPosition, message, resume_name AS resumeName,
      created_at AS createdAt
    FROM job_applications
    ORDER BY id DESC
  `).all();
  return response.json(applications);
});

app.get("/api/manager/applications/:id/resume", (request, response) => {
  const applicationId = Number(request.params.id);
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
    return response.status(400).json({ error: "Invalid application." });
  }
  const application = db.prepare(`
    SELECT resume_name AS resumeName, resume_type AS resumeType, resume_data AS resumeData
    FROM job_applications WHERE id = ?
  `).get(applicationId);
  if (!application) return response.status(404).json({ error: "Application not found." });
  response.set("Content-Type", application.resumeType);
  response.set("Content-Disposition", `attachment; filename="${application.resumeName}"`);
  response.set("X-Content-Type-Options", "nosniff");
  return response.send(application.resumeData);
});

app.post("/api/manager/staff", async (request, response) => {
  const { name, email, password } = request.body ?? {};
  if (
    !validText(name, 2, 80) ||
    typeof email !== "string" ||
    email.length > 254 ||
    !emailPattern.test(email.trim()) ||
    typeof password !== "string" ||
    password.length < minimumPasswordLength ||
    password.length > 128
  ) {
    return response.status(400).json({ error: "Enter a name, valid email, and a password with at least 12 characters." });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, 'staff')
    `).run(name.trim(), email.trim().toLowerCase(), passwordHash);
    const staff = db.prepare(`
      SELECT id, name, email, role, active, created_at AS createdAt FROM users WHERE id = ?
    `).get(result.lastInsertRowid);
    return response.status(201).json({ ...staff, active: Boolean(staff.active) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "An account with this email already exists." });
    throw error;
  }
});

app.patch("/api/manager/staff/:id", (request, response) => {
  const staffId = Number(request.params.id);
  const { active } = request.body ?? {};
  if (!Number.isInteger(staffId) || typeof active !== "boolean") {
    return response.status(400).json({ error: "Choose whether this staff account should be active." });
  }
  const result = db.prepare("UPDATE users SET active = ? WHERE id = ? AND role = 'staff'").run(active ? 1 : 0, staffId);
  if (result.changes === 0) return response.status(404).json({ error: "Staff account not found." });
  const staff = db.prepare(`
    SELECT id, name, email, role, active, created_at AS createdAt FROM users WHERE id = ?
  `).get(staffId);
  if (!active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(staffId);
  return response.json({ ...staff, active: Boolean(staff.active) });
});

app.get("/api/staff/summary", (_request, response) => {
  const today = new Date().toISOString().slice(0, 10);
  const ordersToday = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE date(created_at) = ?").get(today).count;
  const salesToday = db.prepare("SELECT COALESCE(SUM(total_pesewas), 0) AS total FROM orders WHERE date(created_at) = ? AND status != 'cancelled'").get(today).total;
  const activeTickets = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status IN ('received', 'preparing', 'ready')").get().count;
  const pendingBookings = db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE status = 'requested'").get().count;
  const occupiedTables = db.prepare("SELECT COUNT(*) AS count FROM restaurant_tables WHERE status = 'occupied'").get().count;
  response.json({ ordersToday, salesToday: salesToday / 100, activeTickets, pendingBookings, occupiedTables });
});

app.get("/api/staff/tables", (_request, response) => {
  const tables = db.prepare("SELECT * FROM restaurant_tables ORDER BY id").all();
  response.json(tables);
});

app.post("/api/staff/tables", (request, response) => {
  const { name, seats } = request.body ?? {};
  if (!validText(name, 2, 40) || !Number.isInteger(seats) || seats < 1 || seats > 20) {
    return response.status(400).json({ error: "Enter a table name and capacity between 1 and 20." });
  }
  try {
    const table = db.prepare("INSERT INTO restaurant_tables (name, seats) VALUES (?, ?)").run(name.trim(), seats);
    return response.status(201).json(db.prepare("SELECT * FROM restaurant_tables WHERE id = ?").get(table.lastInsertRowid));
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "That table name is already in use." });
    throw error;
  }
});

app.patch("/api/staff/tables/:id", (request, response) => {
  const { status } = request.body ?? {};
  if (!Number.isInteger(Number(request.params.id)) || !["available", "occupied", "reserved"].includes(status)) {
    return response.status(400).json({ error: "Choose a valid table status." });
  }
  const result = db.prepare("UPDATE restaurant_tables SET status = ? WHERE id = ?").run(status, request.params.id);
  if (result.changes === 0) return response.status(404).json({ error: "Table not found." });
  return response.json(db.prepare("SELECT * FROM restaurant_tables WHERE id = ?").get(request.params.id));
});

app.get("/api/staff/reservations", (_request, response) => {
  const reservations = db.prepare(`
    SELECT b.*, t.name AS table_name
    FROM bookings b LEFT JOIN restaurant_tables t ON t.id = b.table_id
    ORDER BY b.booking_date, b.booking_time, b.id DESC
  `).all().map((booking) => ({
    id: booking.id,
    customerName: booking.customer_name,
    phone: booking.phone,
    date: booking.booking_date,
    time: booking.booking_time,
    partySize: booking.party_size,
    notes: booking.notes,
    status: booking.status,
    tableId: booking.table_id,
    tableName: booking.table_name,
    availableTables: getAvailableTables(booking.booking_date, booking.booking_time, booking.party_size, booking.id),
  }));
  response.json(reservations);
});

app.patch("/api/staff/reservations/:id", async (request, response) => {
  const { status, tableId = null } = request.body ?? {};
  const bookingId = Number(request.params.id);
  const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
  if (!booking) return response.status(404).json({ error: "Reservation not found." });
  if (!bookingStatuses.includes(status)) return response.status(400).json({ error: "Choose a valid reservation status." });
  if (["confirmed", "seated"].includes(status) && tableId === null) {
    return response.status(400).json({ error: "Choose an available table before confirming or seating this reservation." });
  }

  let selectedTable = null;
  if (tableId !== null) {
    if (!Number.isInteger(tableId)) return response.status(400).json({ error: "Choose a valid table." });
    selectedTable = db.prepare("SELECT * FROM restaurant_tables WHERE id = ?").get(tableId);
    if (!selectedTable || selectedTable.seats < booking.party_size) {
      return response.status(400).json({ error: "That table cannot seat this party." });
    }
  }

  const updateBooking = db.transaction(() => {
    if (
      selectedTable &&
      ["confirmed", "seated"].includes(status) &&
      !getAvailableTables(booking.booking_date, booking.booking_time, booking.party_size, bookingId)
        .some((table) => table.id === selectedTable.id)
    ) {
      throw new Error("RESERVATION_TABLE_UNAVAILABLE");
    }
    db.prepare("UPDATE bookings SET status = ?, table_id = ? WHERE id = ?").run(status, tableId, bookingId);
    if (booking.table_id && booking.table_id !== tableId) {
      db.prepare("UPDATE restaurant_tables SET status = 'available' WHERE id = ? AND status = 'reserved'").run(booking.table_id);
    }
    if (selectedTable && ["confirmed", "seated"].includes(status)) {
      db.prepare("UPDATE restaurant_tables SET status = ? WHERE id = ?").run(status === "seated" ? "occupied" : "reserved", tableId);
    }
    if (selectedTable && ["completed", "cancelled"].includes(status)) {
      db.prepare("UPDATE restaurant_tables SET status = 'available' WHERE id = ?").run(tableId);
    }
    return db.prepare(`
      SELECT b.*, t.name AS table_name FROM bookings b
      LEFT JOIN restaurant_tables t ON t.id = b.table_id WHERE b.id = ?
    `).get(bookingId);
  });
  let updated;
  try {
    updated = updateBooking();
  } catch (error) {
    if (error.message === "RESERVATION_TABLE_UNAVAILABLE") {
      return response.status(409).json({ error: "That table is no longer available for this time. Refresh the reservation and choose another table." });
    }
    throw error;
  }
  const result = {
    id: updated.id,
    customerName: updated.customer_name,
    phone: updated.phone,
    date: updated.booking_date,
    time: updated.booking_time,
    partySize: updated.party_size,
    notes: updated.notes,
    status: updated.status,
    tableId: updated.table_id,
    tableName: updated.table_name,
  };
  if (booking.status !== updated.status) {
    const customer = booking.customer_user_id
      ? db.prepare("SELECT email FROM users WHERE id = ?").get(booking.customer_user_id)
      : null;
    result.notifications = await sendReservationNotifications({
      ...result,
      customerEmail: customer?.email || null,
    });
  }
  return response.json(result);
});

app.get("/api/staff/menu", (_request, response) => {
  response.json(db.prepare("SELECT * FROM menu_items ORDER BY id DESC").all().map(staffMenuItem));
});

app.post("/api/staff/menu", (request, response) => {
  if (request.user.role !== "manager") return response.status(403).json({ error: "Manager access is required to add menu items." });
  const {
    name,
    description,
    category,
    subcategory,
    beverageGroup,
    price,
    imageUrl,
    badge = "",
    stockQuantity = null,
    lowStockThreshold = 5,
  } = request.body ?? {};
  const placementError = getMenuPlacementError(category, beverageGroup || null, subcategory);
  if (
    !validText(name, 2, 80) ||
    !validText(description, 5, 300) ||
    placementError ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 100000 ||
    !validImageUrl(imageUrl) ||
    (typeof badge !== "string" || badge.length > 40) ||
    (stockQuantity !== null && (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > maxMenuStock)) ||
    !Number.isInteger(lowStockThreshold) ||
    lowStockThreshold < 0 ||
    lowStockThreshold > maxMenuStock ||
    menuItemExists(name)
  ) {
    const message = menuItemExists(name)
      ? "This meal or food is already on the menu. Please use a different item or move the existing one to the correct category."
      : placementError || "Choose a valid menu category, drink type and subcategory, and check the item details, stock and price.";
    return response.status(400).json({ error: message });
  }
  const savedBeverageGroup = category === "Drinks" ? beverageGroup : null;
  const result = db.prepare(`
    INSERT INTO menu_items (
      name, description, category, subcategory, price_pesewas, image_url, badge, stock_quantity, low_stock_threshold, beverage_group
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    description.trim(),
    category,
    subcategory.trim(),
    Math.round(price * 100),
    imageUrl,
    badge.trim() || null,
    stockQuantity,
    lowStockThreshold,
    savedBeverageGroup,
  );
  return response.status(201).json(staffMenuItem(db.prepare("SELECT * FROM menu_items WHERE id = ?").get(result.lastInsertRowid)));
});

app.put("/api/staff/menu/:id", (request, response) => {
  if (request.user.role !== "manager") return response.status(403).json({ error: "Manager access is required to edit menu items." });
  const itemId = Number(request.params.id);
  const { name, description, category, subcategory, beverageGroup, price, imageUrl, badge = "" } = request.body ?? {};
  const placementError = getMenuPlacementError(category, category === "Drinks" ? beverageGroup : beverageGroup || null, subcategory);
  if (
    !Number.isInteger(itemId) ||
    !validText(name, 2, 80) ||
    !validText(description, 5, 300) ||
    !validText(subcategory, 2, 40) ||
    placementError ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 100000 ||
    !validImageUrl(imageUrl) ||
    typeof badge !== "string" ||
    badge.length > 40 ||
    menuItemExists(name, itemId)
  ) {
    const message = menuItemExists(name, itemId)
      ? "This meal or food is already on the menu. Please use a different item or move the existing one to the correct category."
      : placementError || "Check the dish name, description, category, price and image URL.";
    return response.status(400).json({ error: message });
  }
  const savedBeverageGroup = category === "Drinks" ? beverageGroup : null;
  const result = db.prepare(`
    UPDATE menu_items
    SET name = ?, description = ?, category = ?, subcategory = ?, price_pesewas = ?, image_url = ?, badge = ?, beverage_group = ?
    WHERE id = ?
  `).run(name.trim(), description.trim(), category, subcategory.trim(), Math.round(price * 100), imageUrl, badge.trim() || null, savedBeverageGroup, itemId);
  if (result.changes === 0) return response.status(404).json({ error: "Menu item not found." });
  return response.json(staffMenuItem(db.prepare("SELECT * FROM menu_items WHERE id = ?").get(itemId)));
});

app.patch("/api/staff/menu/:id", (request, response) => {
  const itemId = Number(request.params.id);
  const { available } = request.body ?? {};
  if (!Number.isInteger(itemId) || typeof available !== "boolean") {
    return response.status(400).json({ error: "Choose whether the dish is available." });
  }
  const result = db.prepare("UPDATE menu_items SET available = ? WHERE id = ?").run(available ? 1 : 0, itemId);
  if (result.changes === 0) return response.status(404).json({ error: "Menu item not found." });
  return response.json(staffMenuItem(db.prepare("SELECT * FROM menu_items WHERE id = ?").get(itemId)));
});

app.patch("/api/staff/menu/:id/stock", (request, response) => {
  if (request.user.role !== "manager") return response.status(403).json({ error: "Manager access is required to manage menu stock." });
  const itemId = Number(request.params.id);
  const { stockQuantity, lowStockThreshold } = request.body ?? {};
  if (
    !Number.isInteger(itemId) ||
    (stockQuantity !== null && (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > maxMenuStock)) ||
    !Number.isInteger(lowStockThreshold) ||
    lowStockThreshold < 0 ||
    lowStockThreshold > maxMenuStock
  ) {
    return response.status(400).json({ error: "Enter a stock quantity (or leave it untracked) and a valid low-stock threshold." });
  }
  const result = db.prepare(`
    UPDATE menu_items SET stock_quantity = ?, low_stock_threshold = ? WHERE id = ?
  `).run(stockQuantity, lowStockThreshold, itemId);
  if (result.changes === 0) return response.status(404).json({ error: "Menu item not found." });
  return response.json(staffMenuItem(db.prepare("SELECT * FROM menu_items WHERE id = ?").get(itemId)));
});

app.get("/api/staff/orders", (_request, response) => response.json(readOrders()));

app.patch("/api/staff/orders/:id", (request, response) => {
  const orderId = Number(request.params.id);
  const { status } = request.body ?? {};
  if (!Number.isInteger(orderId) || !orderStatuses.includes(status)) {
    return response.status(400).json({ error: "Choose a valid order status." });
  }
  const result = db.prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, orderId);
  if (result.changes === 0) return response.status(404).json({ error: "Order not found." });
  return response.json(readOrders().find((order) => order.id === orderId));
});

app.use("/api", (_request, response) => response.status(404).json({ error: "API route not found." }));
app.use(express.static(frontendDist));
app.use((request, response, next) => {
  if (request.method !== "GET" || request.path.startsWith("/api/")) return next();
  return response.sendFile(resolve(frontendDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Something went wrong on our side. Please try again." });
});
