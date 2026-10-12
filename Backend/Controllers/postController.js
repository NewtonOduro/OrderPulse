import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../database/database.js";
import { createEmailAuthToken } from "../services/email-auth.js";
import { sendCareerApplicationNotifications, sendOrderNotifications, sendReservationNotifications, sendPaymentConfirmationEmail, sendVerificationEmail } from "../services/order-notifications.js";
import { getAvailableTables, reservationDurationMinutes } from "../services/reservation-availability.js";
import { hasValidPaystackSignature, initializePaystackTransaction, verifyPaystackTransaction } from "../services/paystack.js";
import { emailPattern, jobPositionTitles, menuItemExists, cleanMenuItemName, getMenuPlacementError, maxMenuStock, minimumPasswordLength, normalizedPhone, validBookingDate, validBookingTime, validImageUrl, validReservationHours, validText, bookingStartsInFuture, staffMenuItem } from "./shared.js";
import { beverageGroups } from "../schemas/menu-categories.js";

export const submitCareerApplication = async (request, response) => {
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
};

export const processPaystackWebhook = async (request, response) => {
  const signature = request.get("x-paystack-signature");
  const rawBody = Buffer.isBuffer(request.body) ? request.body.toString("utf8") : "";
  if (!hasValidPaystackSignature(rawBody, signature)) {
    return response.status(401).json({ error: "Invalid Paystack webhook signature." });
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return response.status(400).json({ error: "Invalid webhook payload." });
  }
  if (event.event !== "charge.success") return response.status(200).json({ received: true });
  const reference = event.data?.reference;
  if (typeof reference !== "string" || !/^[A-Za-z0-9._-]{8,120}$/.test(reference)) {
    return response.status(400).json({ error: "Invalid payment reference." });
  }
  const matchingOrder = await db.get("SELECT id FROM orders WHERE payment_reference = ?", [reference]);
  if (!matchingOrder) return response.status(200).json({ received: true });
  try {
    await verifyAndRecordPaystackPayment(reference);
    return response.status(200).json({ received: true });
  } catch (error) {
    console.error(`Paystack webhook processing failed for ${reference}: ${error.message}`);
    return response.status(500).json({ error: "Payment verification is temporarily unavailable." });
  }
};

export const trackOrder = async (request, response) => {
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
};

export const submitOrderFeedback = async (request, response) => {
  const { orderNumber, phone, rating, comment = "" } = request.body ?? {};
  if (
    typeof orderNumber !== "string" ||
    !/^GH-[A-F0-9]{8,32}$/i.test(orderNumber.trim()) ||
    !validText(phone, 7, 30) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    typeof comment !== "string" ||
    comment.trim().length > 1000
  ) {
    return response.status(400).json({ error: "Enter your order details, a rating from 1 to 5, and a comment of no more than 1,000 characters." });
  }

  const result = await db.transaction(async (tx) => {
    const order = await tx.get("SELECT * FROM orders WHERE LOWER(order_number) = LOWER(?) FOR UPDATE", [orderNumber.trim()]);
    if (!order || normalizedPhone(order.phone) !== normalizedPhone(phone.trim())) {
      return { status: 404, error: "We couldn't find an order with those details." };
    }
    if (order.payment_status !== "paid" || order.status !== "completed") {
      return { status: 409, error: "Feedback is available after your paid order is completed." };
    }
    if (await tx.get("SELECT id FROM order_feedback WHERE order_id = ?", [order.id])) {
      return { status: 409, error: "Feedback has already been submitted for this order." };
    }
    const inserted = await tx.run(
      "INSERT INTO order_feedback (order_id, rating, comment_text) VALUES (?, ?, ?)",
      [order.id, rating, comment.trim()],
    );
    const feedback = await tx.get("SELECT id, rating, comment_text, created_at FROM order_feedback WHERE id = ?", [inserted.lastInsertRowid]);
    return {
      status: 201,
      feedback: { rating: feedback.rating, comment: feedback.comment_text, createdAt: feedback.created_at },
    };
  });
  if (result.error) return response.status(result.status).json({ error: result.error });
  return response.status(result.status).json({ feedback: result.feedback });
};


export const createOrder = async (request, response) => {
  if (!process.env.PAYSTACK_SECRET_KEY?.trim()) {
    return response.status(503).json({ error: "Online payments are not configured yet. Please try again later." });
  }
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
        INSERT INTO orders (order_number, customer_name, customer_email, phone, order_type, total_pesewas, status, payment_status, payment_reference)
        VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', 'pending', ?)
      `, [orderNumber, customerName.trim(), customerEmail.trim().toLowerCase(), phone.trim(), orderType, totalPesewas, orderNumber]);
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
        status: "awaiting_payment",
        paymentStatus: "pending",
        reference: orderNumber,
        createdAt: new Date().toISOString(),
        items: resolvedItems.map(({ item, quantity }) => ({
          name: item.name,
          quantity,
          unitPrice: item.price_pesewas / 100,
        })),
      };
    });
    let checkout;
    try {
      checkout = await initializePaystackTransaction({
        email: order.customerEmail,
        amountPesewas: Math.round(order.total * 100),
        reference: order.reference,
        callbackUrl: paymentCallbackUrl(request),
        metadata: { orderNumber: order.orderNumber },
      });
    } catch (error) {
      console.error(`Paystack checkout initialization failed for ${order.orderNumber}: ${error.message}`);
      return response.status(error.message === "PAYSTACK_NOT_CONFIGURED" ? 503 : 502).json({
        error: "We saved the order but could not open secure payment checkout. Please contact the restaurant with your order number.",
        orderNumber: order.orderNumber,
      });
    }
    const orderWithCheckout = { ...order, paymentUrl: checkout.authorizationUrl };
    const notifications = await sendOrderNotifications(orderWithCheckout);
    return response.status(201).json({ ...orderWithCheckout, notifications });
  } catch (error) {
    if (["MENU_ITEM_UNAVAILABLE", "MENU_ITEM_STOCK_INSUFFICIENT"].includes(error.message)) {
      return response.status(409).json({ error: "A selected menu item is unavailable or there isn't enough stock. Refresh the menu and try again." });
    }
    throw error;
  }
};


export const verifyPayment = async (request, response) => {
  const reference = request.body?.reference;
  if (typeof reference !== "string" || !/^[A-Za-z0-9._-]{8,120}$/.test(reference)) {
    return response.status(400).json({ error: "Enter a valid Paystack transaction reference." });
  }
  try {
    return response.json(await verifyAndRecordPaystackPayment(reference));
  } catch (error) {
    if (error.message === "PAYMENT_ORDER_NOT_FOUND") {
      return response.status(404).json({ error: "No order was found for this payment reference." });
    }
    if (error.message === "PAYMENT_NOT_CONFIRMED") {
      return response.status(402).json({ error: "Paystack has not confirmed successful payment for this order." });
    }
    if (error.message === "PAYMENT_STATE_CHANGED") {
      return response.status(409).json({ error: "The payment status changed. Refresh the order and try again." });
    }
    console.error(`Paystack payment verification failed for ${reference}: ${error.message}`);
    return response.status(502).json({ error: "We could not verify payment with Paystack right now. Please retry shortly." });
  }
};


export const reservationAvailability = async (request, response) => {
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
};


export const createBooking = async (request, response) => {
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
  const notifications = await sendReservationNotifications(reservation, { notifyStaff: true });
  return response.status(201).json({
    bookingId: reservation.id,
    status: "requested",
    message: "Your table request is in. We'll notify you when the team updates it.",
    notifications,
  });
};


export const createStaff = async (request, response) => {
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
      INSERT INTO users (name, email, password_hash, role, email_verified)
      VALUES (?, ?, ?, 'staff', FALSE)
    `, [name.trim(), email.trim().toLowerCase(), passwordHash]);
    const staff = await db.get(`
      SELECT id, name, email, role, active, created_at FROM users WHERE id = ?
    `, [result.lastInsertRowid]);
    const token = await createEmailAuthToken(staff.id, "verify_email");
    const verificationEmail = await sendVerificationEmail({ email: staff.email, name: staff.name, token });
    return response.status(201).json({
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      active: Boolean(staff.active),
      createdAt: staff.created_at,
      verificationEmail,
    });
  } catch (error) {
    if (["23505", "ER_DUP_ENTRY"].includes(error.code)) return response.status(409).json({ error: "An account with this email already exists." });
    throw error;
  }
};


export const createTable = async (request, response) => {
  const { name, seats } = request.body ?? {};
  if (!validText(name, 2, 40) || !Number.isInteger(seats) || seats < 1 || seats > 20) {
    return response.status(400).json({ error: "Enter a table name and capacity between 1 and 20." });
  }
  try {
    const table = await db.run("INSERT INTO restaurant_tables (name, seats) VALUES (?, ?)", [name.trim(), seats]);
    return response.status(201).json(await db.get("SELECT * FROM restaurant_tables WHERE id = ?", [table.lastInsertRowid]));
  } catch (error) {
    if (["23505", "ER_DUP_ENTRY"].includes(error.code)) return response.status(409).json({ error: "That table name is already in use." });
    throw error;
  }
};


export const createMenuItem = async (request, response) => {
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
};



async function readTrackedOrder(order) {
  const [items, feedback] = await Promise.all([
    db.all(`
      SELECT item_name, quantity, unit_price_pesewas
      FROM order_items
      WHERE order_id = ?
      ORDER BY id
    `, [order.id]),
    db.get("SELECT rating, comment_text, created_at FROM order_feedback WHERE order_id = ?", [order.id]),
  ]);
  return {
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    orderType: order.order_type,
    total: order.total_pesewas / 100,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    feedback: feedback ? {
      rating: feedback.rating,
      comment: feedback.comment_text,
      createdAt: feedback.created_at,
    } : null,
    feedbackEligible: order.payment_status === "paid" && order.status === "completed" && !feedback,
    items: items.map((item) => ({
      name: item.item_name,
      quantity: item.quantity,
      unitPrice: item.unit_price_pesewas / 100,
    })),
  };
}

function paymentCallbackUrl(request) {
  const configuredUrl = process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL;
  const baseUrl = configuredUrl || `${request.protocol}://${request.get("host")}`;
  const url = new URL(baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("INVALID_PUBLIC_APP_URL");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("INVALID_PUBLIC_APP_URL");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("payment", "paystack");
  return url.toString();
}

async function readPaymentOrder(order) {
  const trackedOrder = await readTrackedOrder(order);
  return {
    ...trackedOrder,
    customerName: order.customer_name,
    phone: order.phone,
  };
}

async function verifyAndRecordPaystackPayment(reference) {
  const order = await db.get("SELECT * FROM orders WHERE payment_reference = ?", [reference]);
  if (!order) throw new Error("PAYMENT_ORDER_NOT_FOUND");
  const payment = await verifyPaystackTransaction(reference);
  if (
    payment.status !== "success" ||
    payment.currency !== "GHS" ||
    Number(payment.amount) !== Number(order.total_pesewas) ||
    payment.reference !== reference ||
    payment.customer?.email?.toLowerCase() !== order.customer_email.toLowerCase()
  ) {
    throw new Error("PAYMENT_NOT_CONFIRMED");
  }

  const wasPaid = await db.transaction(async (transaction) => {
    const result = await transaction.run(`
      UPDATE orders
      SET payment_status = 'paid', status = 'received', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND payment_status = 'pending'
    `, [order.id]);
    if (result.changes === 1) return true;
    const current = await transaction.get("SELECT payment_status FROM orders WHERE id = ?", [order.id]);
    if (current?.payment_status === "paid") return false;
    throw new Error("PAYMENT_STATE_CHANGED");
  });
  const updatedOrder = await db.get("SELECT * FROM orders WHERE id = ?", [order.id]);
  const notification = wasPaid
    ? await sendPaymentConfirmationEmail({
      email: updatedOrder.customer_email,
      customerName: updatedOrder.customer_name,
      orderNumber: updatedOrder.order_number,
      total: updatedOrder.total_pesewas / 100,
    })
    : { status: "already_sent", message: "Payment was already confirmed." };
  return { order: await readPaymentOrder(updatedOrder), notification };
}
