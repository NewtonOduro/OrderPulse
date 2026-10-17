import { db } from "../database/database.js";
import { getAvailableTables } from "../services/reservation-availability.js";
import { sendReservationNotifications } from "../services/order-notifications.js";
import {
  cleanMenuItemName,
  getMenuItems,
  getMenuPlacementError,
  maxMenuStock,
  menuCategories,
  menuItemExists,
  publicMenuItem,
  readOrders,
  staffMenuItem,
  utcDayRange,
  bookingStatuses,
  orderStatuses,
  validImageUrl,
  validText,
} from "./shared.js";

export const managerSummary = async (_request, response) => {
  const [dayStart, nextDayStart] = utcDayRange(new Date().toISOString().slice(0, 10));
  const [orders, sales, tickets, bookings, tables, staff, activity] = await Promise.all([
    db.get("SELECT COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ?", [dayStart, nextDayStart]),
    db.get("SELECT COALESCE(SUM(total_pesewas), 0) AS total FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'cancelled' AND payment_status = 'paid'", [dayStart, nextDayStart]),
    db.get("SELECT COUNT(*) AS count FROM orders WHERE status IN ('received', 'preparing', 'ready') AND payment_status = 'paid'"),
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
};


export const managerActivities = async (request, response) => {
  const requestedLimit = Number(request.query.limit);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 100;
  const rows = await db.all(`
    SELECT id, actor_name, actor_email, action, entity, entity_id, details, created_at
    FROM activity_logs
    ORDER BY id DESC
    LIMIT ?
  `, [limit]);
  return response.json(rows.map((row) => ({
    id: row.id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    details: row.details,
    createdAt: row.created_at,
  })));
};


export const managerStaff = async (_request, response) => {
  const users = (await db.all(`
    SELECT id, name, email, role, active, created_at
    FROM users WHERE role IN ('staff', 'manager') ORDER BY role, name
  `)).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: Boolean(user.active),
    createdAt: user.created_at,
  }));
  return response.json(users);
};


export const managerApplications = async (_request, response) => {
  const applications = await db.all(`
    SELECT id, first_name, last_name, email, phone,
      desired_position, message, resume_name, created_at
    FROM job_applications
    ORDER BY id DESC
  `);
  return response.json(applications.map((application) => ({
    id: application.id,
    firstName: application.first_name,
    lastName: application.last_name,
    email: application.email,
    phone: application.phone,
    desiredPosition: application.desired_position,
    message: application.message,
    resumeName: application.resume_name,
    createdAt: application.created_at,
  })));
};


export const applicationResume = async (request, response) => {
  const applicationId = Number(request.params.id);
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
    return response.status(400).json({ error: "Invalid application." });
  }
  const application = await db.get(`
    SELECT resume_name, resume_type, resume_data
    FROM job_applications WHERE id = ?
  `, [applicationId]);
  if (!application) return response.status(404).json({ error: "Application not found." });
  response.set("Content-Type", application.resume_type);
  response.set("Content-Disposition", `attachment; filename="${application.resume_name}"`);
  response.set("X-Content-Type-Options", "nosniff");
  return response.send(application.resume_data);
};


export const updateStaff = async (request, response) => {
  const staffId = Number(request.params.id);
  const { active } = request.body ?? {};
  if (!Number.isInteger(staffId) || typeof active !== "boolean") {
    return response.status(400).json({ error: "Choose whether this staff account should be active." });
  }
  const result = await db.run("UPDATE users SET active = ? WHERE id = ? AND role = 'staff'", [active, staffId]);
  if (result.changes === 0) return response.status(404).json({ error: "Staff account not found." });
  const staff = await db.get(`
    SELECT id, name, email, role, active, created_at FROM users WHERE id = ?
  `, [staffId]);
  if (!active) await db.run("DELETE FROM sessions WHERE user_id = ?", [staffId]);
  return response.json({
    id: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    active: Boolean(staff.active),
    createdAt: staff.created_at,
  });
};


export const staffSummary = async (_request, response) => {
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
};


export const staffTables = async (_request, response) => {
  const tables = await db.all("SELECT * FROM restaurant_tables ORDER BY id");
  response.json(tables);
};


export const updateTable = async (request, response) => {
  const { status } = request.body ?? {};
  if (!Number.isInteger(Number(request.params.id)) || !["available", "occupied", "reserved"].includes(status)) {
    return response.status(400).json({ error: "Choose a valid table status." });
  }
  const result = await db.run("UPDATE restaurant_tables SET status = ? WHERE id = ?", [status, request.params.id]);
  if (result.changes === 0) return response.status(404).json({ error: "Table not found." });
  return response.json(await db.get("SELECT * FROM restaurant_tables WHERE id = ?", [request.params.id]));
};


export const staffReservations = async (_request, response) => {
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
};


export const updateReservation = async (request, response) => {
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
};


export const staffMenu = async (_request, response) => {
  response.json((await db.all("SELECT * FROM menu_items ORDER BY id DESC")).map(staffMenuItem));
};


export const updateMenuItem = async (request, response) => {
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
};


export const setMenuItemAvailability = async (request, response) => {
  const itemId = Number(request.params.id);
  const { available } = request.body ?? {};
  if (!Number.isInteger(itemId) || typeof available !== "boolean") {
    return response.status(400).json({ error: "Choose whether the dish is available." });
  }
  const result = await db.run("UPDATE menu_items SET available = ? WHERE id = ?", [available, itemId]);
  if (result.changes === 0) return response.status(404).json({ error: "Menu item not found." });
  return response.json(staffMenuItem(await db.get("SELECT * FROM menu_items WHERE id = ?", [itemId])));
};


export const updateMenuStock = async (request, response) => {
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
};


export const updateOrderStatus = async (request, response) => {
  const orderId = Number(request.params.id);
  const { status } = request.body ?? {};
  if (!Number.isInteger(orderId) || !orderStatuses.includes(status)) {
    return response.status(400).json({ error: "Choose a valid order status." });
  }
  const existingOrder = await db.get("SELECT payment_status FROM orders WHERE id = ?", [orderId]);
  if (!existingOrder) return response.status(404).json({ error: "Order not found." });
  if (existingOrder.payment_status !== "paid") {
    return response.status(409).json({ error: "Verify the Paystack payment before updating order preparation status." });
  }
  const result = await db.run("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [status, orderId]);
  if (result.changes === 0) return response.status(404).json({ error: "Order not found." });
  return response.json((await readOrders()).find((order) => order.id === orderId));
};

export const staffFeedback = async (_request, response) => {
  const [summary, entries] = await Promise.all([
    db.get("SELECT COUNT(*) AS count, COALESCE(AVG(rating), 0) AS average_rating FROM order_feedback"),
    db.all(`
      SELECT f.id, f.rating, f.comment_text, f.created_at,
        o.order_number, o.customer_name, o.order_type
      FROM order_feedback f
      JOIN orders o ON o.id = f.order_id
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT 100
    `),
  ]);
  return response.json({
    count: Number(summary.count),
    averageRating: Number(summary.average_rating),
    feedback: entries.map((entry) => ({
      id: entry.id,
      rating: entry.rating,
      comment: entry.comment_text,
      createdAt: entry.created_at,
      orderNumber: entry.order_number,
      customerName: entry.customer_name,
      orderType: entry.order_type,
    })),
  });
};

const announcementCategories = ["employee_of_month", "new_employee", "promotion", "general"];

export const staffAnnouncements = async (request, response) => {
  const announcements = await db.all(`
    SELECT a.id, a.category, a.title, a.body, a.created_at, u.name AS author_name,
      r.read_at
    FROM staff_announcements a
    LEFT JOIN users u ON u.id = a.author_id
    LEFT JOIN staff_announcement_reads r ON r.announcement_id = a.id AND r.user_id = ?
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT 100
  `, [request.user.id]);
  return response.json(announcements.map((announcement) => ({
    id: announcement.id,
    category: announcement.category,
    title: announcement.title,
    body: announcement.body,
    authorName: announcement.author_name,
    createdAt: announcement.created_at,
    readAt: announcement.read_at,
  })));
};

export const createStaffAnnouncement = async (request, response) => {
  if (request.user.role !== "manager") {
    return response.status(403).json({ error: "Manager access is required to publish staff announcements." });
  }
  const { category, title, body } = request.body ?? {};
  if (
    !announcementCategories.includes(category) ||
    !validText(title, 3, 120) ||
    !validText(body, 3, 2000)
  ) {
    return response.status(400).json({ error: "Choose a valid announcement type and enter a title and message." });
  }
  const result = await db.run(
    "INSERT INTO staff_announcements (category, title, body, author_id) VALUES (?, ?, ?, ?)",
    [category, title.trim(), body.trim(), request.user.id],
  );
  const announcement = await db.get(`
    SELECT id, category, title, body, created_at
    FROM staff_announcements
    WHERE id = ?
  `, [result.lastInsertRowid]);
  return response.status(201).json({
    id: announcement.id,
    category: announcement.category,
    title: announcement.title,
    body: announcement.body,
    authorName: request.user.name,
    createdAt: announcement.created_at,
    readAt: null,
  });
};

export const markStaffAnnouncementRead = async (request, response) => {
  const announcementId = Number(request.params.id);
  if (!Number.isInteger(announcementId) || announcementId < 1) {
    return response.status(400).json({ error: "Choose a valid staff announcement." });
  }
  const result = await db.transaction(async (tx) => {
    if (!await tx.get("SELECT id FROM staff_announcements WHERE id = ? FOR UPDATE", [announcementId])) {
      return { status: 404, error: "Staff announcement not found." };
    }
    const existingRead = await tx.get(
      "SELECT read_at FROM staff_announcement_reads WHERE announcement_id = ? AND user_id = ?",
      [announcementId, request.user.id],
    );
    if (existingRead) return { status: 200, readAt: existingRead.read_at };
    await tx.run(
      "INSERT INTO staff_announcement_reads (announcement_id, user_id) VALUES (?, ?)",
      [announcementId, request.user.id],
    );
    const read = await tx.get(
      "SELECT read_at FROM staff_announcement_reads WHERE announcement_id = ? AND user_id = ?",
      [announcementId, request.user.id],
    );
    return { status: 200, readAt: read.read_at };
  });
  if (result.error) return response.status(result.status).json({ error: result.error });
  return response.json({ id: announcementId, readAt: result.readAt });
};


export const healthCheck = (_request, response) => response.json({ status: "ok" });

export const publicMenu = async (_request, response) => {
  const [items, popular] = await Promise.all([
    getMenuItems(),
    db.all(`
      SELECT oi.menu_item_id, SUM(oi.quantity) AS quantity
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'paid' AND o.status != 'cancelled'
      GROUP BY oi.menu_item_id
    `),
  ]);
  const quantities = new Map(popular.map((item) => [Number(item.menu_item_id), Number(item.quantity)]));
  return response.json(items
    .map((item) => ({
      ...publicMenuItem(item),
      popularity: quantities.get(Number(item.id)) || 0,
    }))
    .sort((first, second) =>
      menuCategories.indexOf(first.category) - menuCategories.indexOf(second.category) ||
      first.id - second.id,
    ));
};

export const staffOrders = async (_request, response) => response.json(await readOrders());
