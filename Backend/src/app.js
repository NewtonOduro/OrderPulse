import express from "express";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { db } from "./database.js";
import {
  sendCareerApplicationNotifications,
  sendOrderNotifications,
  sendReservationNotifications,
} from "./order-notifications.js";
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

app.post("/api/careers/applications", applicationLimiter, express.json({ limit: "7mb" }), async (request, response) => {
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

  const result = await db.run(`
    INSERT INTO job_applications (
      first_name, last_name, email, phone, desired_position, message,
      resume_name, resume_type, resume_data, consent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    firstName.trim(),
    lastName.trim(),
    email.trim().toLowerCase(),
    phone.trim(),
    desiredPosition,
    message.trim(),
    safeResumeName,
    resumeType,
    resumeBuffer,
  ]);
  const applicationNumber = `OP-${result.lastInsertRowid}`;
  const notifications = await sendCareerApplicationNotifications({
    applicationNumber,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    desiredPosition,
    message: message.trim(),
    resumeName: safeResumeName,
    resumeType,
    resumeData: resumeBuffer,
  });
  return response.status(201).json({ applicationNumber, notifications });
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

const getMenuItems = () => db.all(`
  SELECT * FROM menu_items
  WHERE available = TRUE AND (stock_quantity IS NULL OR stock_quantity > 0)
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
const cleanMenuItemName = (value) => value.trim().replace(/\s+/g, " ");
const normalizeMenuItemName = (value) => typeof value === "string" ? cleanMenuItemName(value).toLowerCase() : "";
const menuItemExists = async (name, excludeId = null) => {
  const query = excludeId === null
    ? "SELECT id FROM menu_items WHERE LOWER(name) = ?"
    : "SELECT id FROM menu_items WHERE LOWER(name) = ? AND id != ?";
  const params = excludeId === null ? [normalizeMenuItemName(name)] : [normalizeMenuItemName(name), excludeId];
  return db.get(query, params);
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
const utcDayRange = (date) => [
  `${date}T00:00:00.000Z`,
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString(),
];
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
    const result = await db.run(`
      INSERT INTO users (name, email, phone, password_hash, role)
      VALUES (?, ?, ?, ?, 'customer')
    `, [name.trim(), email.trim().toLowerCase(), phone.trim(), passwordHash]);
    const user = await db.get("SELECT id, name, email, phone, role FROM users WHERE id = ?", [result.lastInsertRowid]);
    await setSession(response, user.id);
    return response.status(201).json({ user });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    throw error;
  }
});

app.post("/api/auth/login", authenticationLimiter, async (request, response) => {
  const { email, password } = request.body ?? {};
  if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || password.length > 128) {
    return response.status(400).json({ error: "Enter your email address and password." });
  }
  const user = await db.get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email.trim().toLowerCase()]);
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    return response.status(401).json({ error: "The email or password is incorrect." });
  }
  await setSession(response, user.id);
  return response.json({ user: safeUser(user) });
});

app.get("/api/auth/me", requireUser, (request, response) => response.json({ user: request.user }));

app.post("/api/auth/logout", async (request, response) => {
  await clearSession(request, response);
  return response.status(204).end();
});

async function readOrders(database = db) {
  const orders = await database.all("SELECT * FROM orders ORDER BY created_at DESC, id DESC");
  return Promise.all(orders.map(async (order) => ({
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    phone: order.phone,
    orderType: order.order_type,
    total: order.total_pesewas / 100,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: (await database.all("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", [order.id])).map((item) => ({
      name: item.item_name,
      quantity: item.quantity,
      unitPrice: item.unit_price_pesewas / 100,
    })),
  })));
}

async function readTrackedOrder(order) {
  const items = await db.all(`
    SELECT item_name, quantity, unit_price_pesewas
    FROM order_items
    WHERE order_id = ?
    ORDER BY id
  `, [order.id]);
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
app.get("/api/menu", async (_request, response) =>
  response.json(
    (await getMenuItems())
      .map(publicMenuItem)
      .sort((first, second) =>
        menuCategories.indexOf(first.category) - menuCategories.indexOf(second.category) ||
        first.id - second.id,
      ),
  ),
);

app.post("/api/order-tracking", orderLimiter, async (request, response) => {
  const { orderNumber, phone } = request.body ?? {};
  if (
    typeof orderNumber !== "string" ||
    !/^GH-[A-F0-9]{8,32}$/i.test(orderNumber.trim()) ||
    !validText(phone, 7, 30)
  ) {
    return response.status(400).json({ error: "Enter the order number and phone number used at checkout." });
  }
  const order = await db.get("SELECT * FROM orders WHERE LOWER(order_number) = LOWER(?)", [orderNumber.trim()]);
  if (!order || normalizedPhone(order.phone) !== normalizedPhone(phone.trim())) {
    return response.status(404).json({ error: "We couldn't find an order with those details." });
  }
  return response.json(await readTrackedOrder(order));
});

app.post("/api/orders", orderLimiter, async (request, response) => {
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
  try {
    const order = await db.transaction(async (tx) => {
      const resolvedItems = [];
      for (const { id, quantity } of requestedItems) {
        const item = await tx.get(`
          SELECT * FROM menu_items
          WHERE id = ? AND available = TRUE AND (stock_quantity IS NULL OR stock_quantity > 0)
          FOR UPDATE
        `, [id]);
      if (!item) throw new Error("MENU_ITEM_UNAVAILABLE");
      if (item.stock_quantity !== null && item.stock_quantity < quantity) {
        throw new Error("MENU_ITEM_STOCK_INSUFFICIENT");
      }
        resolvedItems.push({ item, quantity });
      }
      for (const { item, quantity } of resolvedItems) {
        if (item.stock_quantity !== null) {
          const result = await tx.run(`
            UPDATE menu_items
            SET stock_quantity = ?
            WHERE id = ? AND stock_quantity = ?
          `, [item.stock_quantity - quantity, item.id, item.stock_quantity]);
          if (result.changes !== 1) throw new Error("MENU_ITEM_STOCK_INSUFFICIENT");
        }
      }
    const totalPesewas = resolvedItems.reduce(
      (total, { item, quantity }) => total + item.price_pesewas * quantity,
      0,
    );
    const orderNumber = `GH-${randomBytes(16).toString("hex").toUpperCase()}`;
    const insertedOrder = await tx.run(`
      INSERT INTO orders (order_number, customer_name, customer_email, phone, order_type, total_pesewas)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [orderNumber, customerName.trim(), customerEmail.trim().toLowerCase(), phone.trim(), orderType, totalPesewas]);
    for (const { item, quantity } of resolvedItems) {
      await tx.run(`
        INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_pesewas, quantity)
        VALUES (?, ?, ?, ?, ?)
      `, [insertedOrder.lastInsertRowid, item.id, item.name, item.price_pesewas, quantity]);
    }
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
    const notifications = await sendOrderNotifications(order);
    return response.status(201).json({ ...order, notifications });
  } catch (error) {
    if (["MENU_ITEM_UNAVAILABLE", "MENU_ITEM_STOCK_INSUFFICIENT"].includes(error.message)) {
      return response.status(409).json({ error: "A selected menu item is unavailable or there isn't enough stock. Refresh the menu and try again." });
    }
    throw error;
  }
});

app.get("/api/reservation-availability", async (request, response) => {
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
  const tables = await getAvailableTables(date, time, partySize);
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
  if ((await getAvailableTables(date, time, partySize)).length === 0) {
    return response.status(409).json({ error: "No tables are available for that time and party size. Please choose another time." });
  }

  const booking = await db.run(`
    INSERT INTO bookings (customer_name, phone, booking_date, booking_time, party_size, notes, customer_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [request.user.name, request.user.phone, date, time, partySize, notes.trim(), request.user.id]);

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

app.get("/api/customer/reservations", requireUser, requireCustomer, async (request, response) => {
  const reservations = (await db.all(`
    SELECT b.id, b.booking_date, b.booking_time, b.party_size, b.notes, b.status, t.name AS table_name
    FROM bookings b LEFT JOIN restaurant_tables t ON t.id = b.table_id
    WHERE b.customer_user_id = ?
    ORDER BY b.booking_date DESC, b.booking_time DESC
  `, [request.user.id])).map((booking) => ({
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

app.get("/api/manager/summary", async (_request, response) => {
  const [dayStart, nextDayStart] = utcDayRange(new Date().toISOString().slice(0, 10));
  const [orders, sales, tickets, bookings, tables, staff, activity] = await Promise.all([
    db.get("SELECT COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ?", [dayStart, nextDayStart]),
    db.get("SELECT COALESCE(SUM(total_pesewas), 0) AS total FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'", [dayStart, nextDayStart]),
    db.get("SELECT COUNT(*) AS count FROM orders WHERE status IN ('received', 'preparing', 'ready')"),
    db.get("SELECT COUNT(*) AS count FROM bookings WHERE status = 'requested'"),
    db.get("SELECT COUNT(*) AS count FROM restaurant_tables WHERE status = 'occupied'"),
    db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'staff' AND active = TRUE"),
    db.get("SELECT COUNT(*) AS count FROM activity_logs"),
  ]);
  return response.json({
    ordersToday: Number(orders.count),
    salesToday: Number(sales.total) / 100,
    activeTickets: Number(tickets.count),
    pendingBookings: Number(bookings.count),
    occupiedTables: Number(tables.count),
    activeStaff: Number(staff.count),
    activityCount: Number(activity.count),
  });
});

app.get("/api/manager/activities", async (request, response) => {
  const requestedLimit = Number(request.query.limit);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 100;
  const rows = await db.all(`
    SELECT id, actor_name AS "actorName", actor_email AS "actorEmail", action, entity, entity_id AS "entityId", details, created_at AS "createdAt"
    FROM activity_logs
    ORDER BY id DESC
    LIMIT ?
  `, [limit]);
  return response.json(rows);
});

app.get("/api/manager/staff", async (_request, response) => {
  const users = (await db.all(`
    SELECT id, name, email, role, active, created_at AS "createdAt"
    FROM users WHERE role IN ('staff', 'manager') ORDER BY role, name
  `)).map((user) => ({ ...user, active: Boolean(user.active) }));
  return response.json(users);
});

app.get("/api/manager/applications", async (_request, response) => {
  const applications = await db.all(`
    SELECT id, first_name AS "firstName", last_name AS "lastName", email, phone,
      desired_position AS "desiredPosition", message, resume_name AS "resumeName",
      created_at AS "createdAt"
    FROM job_applications
    ORDER BY id DESC
  `);
  return response.json(applications);
});

app.get("/api/manager/applications/:id/resume", async (request, response) => {
  const applicationId = Number(request.params.id);
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
    return response.status(400).json({ error: "Invalid application." });
  }
  const application = await db.get(`
    SELECT resume_name AS "resumeName", resume_type AS "resumeType", resume_data AS "resumeData"
    FROM job_applications WHERE id = ?
  `, [applicationId]);
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
    const result = await db.run(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, 'staff')
    `, [name.trim(), email.trim().toLowerCase(), passwordHash]);
    const staff = await db.get(`
      SELECT id, name, email, role, active, created_at AS "createdAt" FROM users WHERE id = ?
    `, [result.lastInsertRowid]);
    return response.status(201).json({ ...staff, active: Boolean(staff.active) });
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "An account with this email already exists." });
    throw error;
  }
});

app.patch("/api/manager/staff/:id", async (request, response) => {
  const staffId = Number(request.params.id);
  const { active } = request.body ?? {};
  if (!Number.isInteger(staffId) || typeof active !== "boolean") {
    return response.status(400).json({ error: "Choose whether this staff account should be active." });
  }
  const result = await db.run("UPDATE users SET active = ? WHERE id = ? AND role = 'staff'", [active, staffId]);
  if (result.changes === 0) return response.status(404).json({ error: "Staff account not found." });
  const staff = await db.get(`
    SELECT id, name, email, role, active, created_at AS "createdAt" FROM users WHERE id = ?
  `, [staffId]);
  if (!active) await db.run("DELETE FROM sessions WHERE user_id = ?", [staffId]);
  return response.json({ ...staff, active: Boolean(staff.active) });
});

app.get("/api/staff/summary", async (_request, response) => {
  const [dayStart, nextDayStart] = utcDayRange(new Date().toISOString().slice(0, 10));
  const [orders, sales, tickets, bookings, tables] = await Promise.all([
    db.get("SELECT COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ?", [dayStart, nextDayStart]),
    db.get("SELECT COALESCE(SUM(total_pesewas), 0) AS total FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled'", [dayStart, nextDayStart]),
    db.get("SELECT COUNT(*) AS count FROM orders WHERE status IN ('received', 'preparing', 'ready')"),
    db.get("SELECT COUNT(*) AS count FROM bookings WHERE status = 'requested'"),
    db.get("SELECT COUNT(*) AS count FROM restaurant_tables WHERE status = 'occupied'"),
  ]);
  response.json({
    ordersToday: Number(orders.count),
    salesToday: Number(sales.total) / 100,
    activeTickets: Number(tickets.count),
    pendingBookings: Number(bookings.count),
    occupiedTables: Number(tables.count),
  });
});

app.get("/api/staff/tables", async (_request, response) => {
  const tables = await db.all("SELECT * FROM restaurant_tables ORDER BY id");
  response.json(tables);
});

app.post("/api/staff/tables", async (request, response) => {
  const { name, seats } = request.body ?? {};
  if (!validText(name, 2, 40) || !Number.isInteger(seats) || seats < 1 || seats > 20) {
    return response.status(400).json({ error: "Enter a table name and capacity between 1 and 20." });
  }
  try {
    const table = await db.run("INSERT INTO restaurant_tables (name, seats) VALUES (?, ?)", [name.trim(), seats]);
    return response.status(201).json(await db.get("SELECT * FROM restaurant_tables WHERE id = ?", [table.lastInsertRowid]));
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({ error: "That table name is already in use." });
    throw error;
  }
});

app.patch("/api/staff/tables/:id", async (request, response) => {
  const { status } = request.body ?? {};
  if (!Number.isInteger(Number(request.params.id)) || !["available", "occupied", "reserved"].includes(status)) {
    return response.status(400).json({ error: "Choose a valid table status." });
  }
  const result = await db.run("UPDATE restaurant_tables SET status = ? WHERE id = ?", [status, request.params.id]);
  if (result.changes === 0) return response.status(404).json({ error: "Table not found." });
  return response.json(await db.get("SELECT * FROM restaurant_tables WHERE id = ?", [request.params.id]));
});

app.get("/api/staff/reservations", async (_request, response) => {
  const bookings = await db.all(`
    SELECT b.*, t.name AS table_name
    FROM bookings b LEFT JOIN restaurant_tables t ON t.id = b.table_id
    ORDER BY b.booking_date, b.booking_time, b.id DESC
  `);
  const reservations = await Promise.all(bookings.map(async (booking) => ({
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
    availableTables: await getAvailableTables(booking.booking_date, booking.booking_time, booking.party_size, booking.id),
  })));
  response.json(reservations);
});

app.patch("/api/staff/reservations/:id", async (request, response) => {
  const { status, tableId = null } = request.body ?? {};
  const bookingId = Number(request.params.id);
  const booking = await db.get("SELECT * FROM bookings WHERE id = ?", [bookingId]);
  if (!booking) return response.status(404).json({ error: "Reservation not found." });
  if (!bookingStatuses.includes(status)) return response.status(400).json({ error: "Choose a valid reservation status." });
  if (["confirmed", "seated"].includes(status) && tableId === null) {
    return response.status(400).json({ error: "Choose an available table before confirming or seating this reservation." });
  }

  let selectedTable = null;
  if (tableId !== null) {
    if (!Number.isInteger(tableId)) return response.status(400).json({ error: "Choose a valid table." });
    selectedTable = await db.get("SELECT * FROM restaurant_tables WHERE id = ?", [tableId]);
    if (!selectedTable || selectedTable.seats < booking.party_size) {
      return response.status(400).json({ error: "That table cannot seat this party." });
    }
  }

  const updateBooking = async (tx) => {
    if (selectedTable && ["confirmed", "seated"].includes(status)) {
      await tx.get("SELECT id FROM restaurant_tables WHERE id = ? FOR UPDATE", [selectedTable.id]);
    }
    if (
      selectedTable &&
      ["confirmed", "seated"].includes(status) &&
      !(await getAvailableTables(booking.booking_date, booking.booking_time, booking.party_size, bookingId, tx))
        .some((table) => table.id === selectedTable.id)
    ) {
      throw new Error("RESERVATION_TABLE_UNAVAILABLE");
    }
    await tx.run("UPDATE bookings SET status = ?, table_id = ? WHERE id = ?", [status, tableId, bookingId]);
    if (booking.table_id && booking.table_id !== tableId) {
      await tx.run("UPDATE restaurant_tables SET status = 'available' WHERE id = ? AND status = 'reserved'", [booking.table_id]);
    }
    if (selectedTable && ["confirmed", "seated"].includes(status)) {
      await tx.run("UPDATE restaurant_tables SET status = ? WHERE id = ?", [status === "seated" ? "occupied" : "reserved", tableId]);
    }
    if (selectedTable && ["completed", "cancelled"].includes(status)) {
      await tx.run("UPDATE restaurant_tables SET status = 'available' WHERE id = ?", [tableId]);
    }
    return tx.get(`
      SELECT b.*, t.name AS table_name FROM bookings b
      LEFT JOIN restaurant_tables t ON t.id = b.table_id WHERE b.id = ?
    `, [bookingId]);
  };
  let updated;
  try {
    updated = await db.transaction(updateBooking);
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
      ? await db.get("SELECT email FROM users WHERE id = ?", [booking.customer_user_id])
      : null;
    result.notifications = await sendReservationNotifications({
      ...result,
      customerEmail: customer?.email || null,
    });
  }
  return response.json(result);
});

app.get("/api/staff/menu", async (_request, response) => {
  response.json((await db.all("SELECT * FROM menu_items ORDER BY id DESC")).map(staffMenuItem));
});

app.post("/api/staff/menu", async (request, response) => {
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
  const duplicateExists = await menuItemExists(name);
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
    duplicateExists
  ) {
    const message = duplicateExists
      ? "This meal or food is already on the menu. Please use a different item or move the existing one to the correct category."
      : placementError || "Choose a valid menu category, drink type and subcategory, and check the item details, stock and price.";
    return response.status(400).json({ error: message });
  }
  const savedBeverageGroup = category === "Drinks" ? beverageGroup : null;
  const result = await db.run(`
    INSERT INTO menu_items (
      name, description, category, subcategory, price_pesewas, image_url, badge, stock_quantity, low_stock_threshold, beverage_group
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    cleanMenuItemName(name),
    description.trim(),
    category,
    subcategory.trim(),
    Math.round(price * 100),
    imageUrl,
    badge.trim() || null,
    stockQuantity,
    lowStockThreshold,
    savedBeverageGroup,
  ]);
  return response.status(201).json(staffMenuItem(await db.get("SELECT * FROM menu_items WHERE id = ?", [result.lastInsertRowid])));
});

app.put("/api/staff/menu/:id", async (request, response) => {
  if (request.user.role !== "manager") return response.status(403).json({ error: "Manager access is required to edit menu items." });
  const itemId = Number(request.params.id);
  const { name, description, category, subcategory, beverageGroup, price, imageUrl, badge = "" } = request.body ?? {};
  const placementError = getMenuPlacementError(category, category === "Drinks" ? beverageGroup : beverageGroup || null, subcategory);
  const duplicateExists = await menuItemExists(name, itemId);
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
    duplicateExists
  ) {
    const message = duplicateExists
      ? "This meal or food is already on the menu. Please use a different item or move the existing one to the correct category."
      : placementError || "Check the dish name, description, category, price and image URL.";
    return response.status(400).json({ error: message });
  }
  const savedBeverageGroup = category === "Drinks" ? beverageGroup : null;
  const result = await db.run(`
    UPDATE menu_items
    SET name = ?, description = ?, category = ?, subcategory = ?, price_pesewas = ?, image_url = ?, badge = ?, beverage_group = ?
    WHERE id = ?
  `, [cleanMenuItemName(name), description.trim(), category, subcategory.trim(), Math.round(price * 100), imageUrl, badge.trim() || null, savedBeverageGroup, itemId]);
  if (result.changes === 0) return response.status(404).json({ error: "Menu item not found." });
  return response.json(staffMenuItem(await db.get("SELECT * FROM menu_items WHERE id = ?", [itemId])));
});

app.patch("/api/staff/menu/:id", async (request, response) => {
  const itemId = Number(request.params.id);
  const { available } = request.body ?? {};
  if (!Number.isInteger(itemId) || typeof available !== "boolean") {
    return response.status(400).json({ error: "Choose whether the dish is available." });
  }
  const result = await db.run("UPDATE menu_items SET available = ? WHERE id = ?", [available, itemId]);
  if (result.changes === 0) return response.status(404).json({ error: "Menu item not found." });
  return response.json(staffMenuItem(await db.get("SELECT * FROM menu_items WHERE id = ?", [itemId])));
});

app.patch("/api/staff/menu/:id/stock", async (request, response) => {
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
  const result = await db.run(`
    UPDATE menu_items SET stock_quantity = ?, low_stock_threshold = ? WHERE id = ?
  `, [stockQuantity, lowStockThreshold, itemId]);
  if (result.changes === 0) return response.status(404).json({ error: "Menu item not found." });
  return response.json(staffMenuItem(await db.get("SELECT * FROM menu_items WHERE id = ?", [itemId])));
});

app.get("/api/staff/orders", async (_request, response) => response.json(await readOrders()));

app.patch("/api/staff/orders/:id", async (request, response) => {
  const orderId = Number(request.params.id);
  const { status } = request.body ?? {};
  if (!Number.isInteger(orderId) || !orderStatuses.includes(status)) {
    return response.status(400).json({ error: "Choose a valid order status." });
  }
  const result = await db.run("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, orderId]);
  if (result.changes === 0) return response.status(404).json({ error: "Order not found." });
  return response.json((await readOrders()).find((order) => order.id === orderId));
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
