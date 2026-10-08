import nodemailer from "nodemailer";

const hubtelEndpoint = "https://smsc.hubtel.com/v1/messages/send";
const ghanaCedis = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const formatMoney = (amount) => ghanaCedis.format(amount).replace("GHS", "GH₵");
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

function configurationStatus(values, required, label) {
  const present = required.filter((key) => Boolean(values[key])).length;
  if (present === 0) return { status: "not_configured", message: `${label} is not configured.` };
  if (present < required.length) return { status: "failed", message: `${label} configuration is incomplete.` };
  return null;
}

async function sendEmail({ to, subject, text, html, reference }) {
  const config = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  };
  const notReady = configurationStatus(config, Object.keys(config), "Email");
  if (notReady) return notReady;
  if (typeof to !== "string" || !to.trim()) {
    return { status: "no_recipient", message: "No email address is available for this notification." };
  }

  try {
    const port = Number(config.SMTP_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { status: "failed", message: "SMTP_PORT must be a valid port number." };
    }
    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    await transporter.sendMail({
      from: config.SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    return { status: "sent", message: "Email sent." };
  } catch (error) {
    console.error(`Email delivery failed for ${reference}:`, error.message);
    return { status: "failed", message: "Email could not be sent. Check the SMTP settings and server logs." };
  }
}

function normalizeGhanaPhone(phone) {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `233${digits.slice(1)}`;
  return digits;
}

async function sendSms({ phone, content, reference }) {
  const config = {
    HUBTEL_CLIENT_ID: process.env.HUBTEL_CLIENT_ID,
    HUBTEL_CLIENT_SECRET: process.env.HUBTEL_CLIENT_SECRET,
    HUBTEL_SENDER_ID: process.env.HUBTEL_SENDER_ID,
  };
  const notReady = configurationStatus(config, Object.keys(config), "SMS");
  if (notReady) return notReady;

  if (typeof phone !== "string" || !phone.trim()) {
    return { status: "no_recipient", message: "No phone number is available for this notification." };
  }
  const recipient = normalizeGhanaPhone(phone);
  if (!/^\d{9,15}$/.test(recipient)) {
    return { status: "failed", message: "The phone number is not valid for SMS delivery." };
  }

  const endpoint = new URL(hubtelEndpoint);
  endpoint.search = new URLSearchParams({
    From: config.HUBTEL_SENDER_ID,
    To: recipient,
    Content: content,
    ClientId: config.HUBTEL_CLIENT_ID,
    ClientSecret: config.HUBTEL_CLIENT_SECRET,
  }).toString();

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      console.error(`SMS delivery failed for ${reference}: Hubtel returned HTTP ${response.status}.`);
      return { status: "failed", message: "SMS could not be sent. Check the Hubtel settings and server logs." };
    }
    return { status: "sent", message: "SMS sent." };
  } catch (error) {
    console.error(`SMS delivery failed for ${reference}:`, error.message);
    return { status: "failed", message: "SMS could not be sent. Check the Hubtel settings and server logs." };
  }
}

export async function sendOrderNotifications(order) {
  const lines = [
    `Hello ${order.customerName},`,
    "",
    `We received order ${order.orderNumber} (${order.orderType === "dine-in" ? "Dine in" : "Pickup"}).`,
    "",
    ...order.items.map((item) => `${item.quantity} × ${item.name} — ${formatMoney(item.unitPrice * item.quantity)}`),
    "",
    `Total: ${formatMoney(order.total)}`,
    `Status: ${order.status}`,
    "",
    "Thank you for choosing OrderPulse.",
  ];
  const htmlItems = order.items.map((item) =>
    `<li>${item.quantity} × ${escapeHtml(item.name)} — ${formatMoney(item.unitPrice * item.quantity)}</li>`,
  ).join("");
  const emailNotification = sendEmail({
    to: order.customerEmail,
    subject: `OrderPulse order ${order.orderNumber}`,
    text: lines.join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(order.customerName)},</p><p>We received order <strong>${escapeHtml(order.orderNumber)}</strong> (${order.orderType === "dine-in" ? "Dine in" : "Pickup"}).</p><ul>${htmlItems}</ul><p><strong>Total: ${formatMoney(order.total)}</strong></p><p>Status: ${escapeHtml(order.status)}</p><p>Thank you for choosing OrderPulse.</p></div>`,
    reference: `order ${order.orderNumber}`,
  });
  const smsNotification = sendSms({
    phone: order.phone,
    content: `OrderPulse: Order ${order.orderNumber} received. Total ${formatMoney(order.total)}. ${order.orderType === "dine-in" ? "Dine in" : "Pickup"}.`,
    reference: `order ${order.orderNumber}`,
  });
  const [email, sms] = await Promise.all([emailNotification, smsNotification]);
  return { email, sms };
}

export async function sendReservationNotifications(reservation) {
  const statusMessage = reservation.status === "requested"
    ? "We received your table request. Our team will confirm it shortly."
    : `Your reservation is ${reservation.status}${reservation.tableName ? ` at ${reservation.tableName}` : ""}.`;
  const text = [
    `Hello ${reservation.customerName},`,
    "",
    statusMessage,
    `Date: ${reservation.date} at ${reservation.time}`,
    `Guests: ${reservation.partySize}`,
    reservation.tableName ? `Table: ${reservation.tableName}` : null,
    reservation.notes ? `Notes: ${reservation.notes}` : null,
    "",
    "OrderPulse · Accra",
  ].filter((line) => line !== null).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(reservation.customerName)},</p><p>${escapeHtml(statusMessage)}</p><p><strong>Date:</strong> ${escapeHtml(reservation.date)} at ${escapeHtml(reservation.time)}<br><strong>Guests:</strong> ${reservation.partySize}${reservation.tableName ? `<br><strong>Table:</strong> ${escapeHtml(reservation.tableName)}` : ""}</p>${reservation.notes ? `<p><strong>Your note:</strong> ${escapeHtml(reservation.notes)}</p>` : ""}<p>OrderPulse · Accra</p></div>`;
  const reference = `reservation ${reservation.id}`;
  const [email, sms] = await Promise.all([
    sendEmail({
      to: reservation.customerEmail,
      subject: `OrderPulse reservation ${reservation.status}`,
      text,
      html,
      reference,
    }),
    sendSms({
      phone: reservation.phone,
      content: `OrderPulse: Reservation ${reservation.status}. ${reservation.date} at ${reservation.time}, ${reservation.partySize} guests${reservation.tableName ? `, ${reservation.tableName}` : ""}.`,
      reference,
    }),
  ]);
  return { email, sms };
}
