import nodemailer from "nodemailer";

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

async function sendEmail({ to, subject, text, html, reference, replyTo, attachments }) {
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
      ...(replyTo ? { replyTo } : {}),
      ...(attachments ? { attachments } : {}),
    });
    return { status: "sent", message: "Email sent." };
  } catch (error) {
    console.error(`Email delivery failed for ${reference}:`, error.message);
    return { status: "failed", message: "Email could not be sent. Check the SMTP settings and server logs." };
  }
}

async function sendStaffEmail({ subject, text, html, reference }) {
  const to = process.env.STAFF_NOTIFICATION_EMAIL;
  if (!to) {
    return { status: "no_recipient", message: "Staff notification email is not configured." };
  }
  return sendEmail({ to, subject, text, html, reference });
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
  const [email, staffEmail] = await Promise.all([
    sendEmail({
      to: order.customerEmail,
      subject: `OrderPulse order ${order.orderNumber}`,
      text: lines.join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(order.customerName)},</p><p>We received order <strong>${escapeHtml(order.orderNumber)}</strong> (${order.orderType === "dine-in" ? "Dine in" : "Pickup"}).</p><ul>${htmlItems}</ul><p><strong>Total: ${formatMoney(order.total)}</strong></p><p>Status: ${escapeHtml(order.status)}</p><p>Thank you for choosing OrderPulse.</p></div>`,
      reference: `order ${order.orderNumber}`,
    }),
    sendStaffEmail({
      subject: `New OrderPulse order ${order.orderNumber}`,
      text: [
        `New ${order.orderType === "dine-in" ? "dine-in" : "pickup"} order ${order.orderNumber}`,
        "",
        `Customer: ${order.customerName}`,
        `Email: ${order.customerEmail}`,
        `Phone: ${order.phone}`,
        "",
        ...order.items.map((item) => `${item.quantity} × ${item.name} — ${formatMoney(item.unitPrice * item.quantity)}`),
        "",
        `Total: ${formatMoney(order.total)}`,
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>New restaurant order</h1><p><strong>Order:</strong> ${escapeHtml(order.orderNumber)} (${order.orderType === "dine-in" ? "Dine in" : "Pickup"})</p><p><strong>Customer:</strong> ${escapeHtml(order.customerName)}<br><strong>Email:</strong> ${escapeHtml(order.customerEmail)}<br><strong>Phone:</strong> ${escapeHtml(order.phone)}</p><ul>${htmlItems}</ul><p><strong>Total: ${formatMoney(order.total)}</strong></p></div>`,
      reference: `staff notification for order ${order.orderNumber}`,
    }),
  ]);
  return { email, staffEmail };
}

export async function sendReservationNotifications(reservation, { notifyStaff = false } = {}) {
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
  const notifications = [
    sendEmail({
      to: reservation.customerEmail,
      subject: `OrderPulse reservation ${reservation.status}`,
      text,
      html,
      reference,
    }),
  ];
  if (notifyStaff) {
    notifications.push(sendStaffEmail({
      subject: `New OrderPulse table request for ${reservation.date} at ${reservation.time}`,
      text: [
        `New table request ${reservation.id}`,
        "",
        `Customer: ${reservation.customerName}`,
        `Email: ${reservation.customerEmail}`,
        `Phone: ${reservation.phone}`,
        `Date: ${reservation.date} at ${reservation.time}`,
        `Guests: ${reservation.partySize}`,
        reservation.notes ? `Notes: ${reservation.notes}` : null,
      ].filter((line) => line !== null).join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>New table request</h1><p><strong>Customer:</strong> ${escapeHtml(reservation.customerName)}<br><strong>Email:</strong> ${escapeHtml(reservation.customerEmail)}<br><strong>Phone:</strong> ${escapeHtml(reservation.phone)}</p><p><strong>Date:</strong> ${escapeHtml(reservation.date)} at ${escapeHtml(reservation.time)}<br><strong>Guests:</strong> ${reservation.partySize}</p>${reservation.notes ? `<p><strong>Notes:</strong> ${escapeHtml(reservation.notes)}</p>` : ""}</div>`,
      reference: `staff notification for reservation ${reservation.id}`,
    }));
  }
  const [email, staffEmail] = await Promise.all(notifications);
  return { email, ...(notifyStaff ? { staffEmail } : {}) };
}

export async function sendCareerApplicationNotifications(application) {
  const reference = `job application ${application.applicationNumber}`;
  const applicantName = `${application.firstName} ${application.lastName}`;
  const applicantEmail = sendEmail({
    to: application.email,
    subject: `OrderPulse received your ${application.desiredPosition} application`,
    text: [
      `Hello ${application.firstName},`,
      "",
      `We received your application for the ${application.desiredPosition} position.`,
      `Your application reference is ${application.applicationNumber}.`,
      "Our team will review your application and contact you if we need more information.",
      "",
      "OrderPulse · Accra",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(application.firstName)},</p><p>We received your application for the <strong>${escapeHtml(application.desiredPosition)}</strong> position.</p><p>Your application reference is <strong>${escapeHtml(application.applicationNumber)}</strong>.</p><p>Our team will review your application and contact you if we need more information.</p><p>OrderPulse · Accra</p></div>`,
    reference,
  });

  const employerEmailAddress = process.env.JOB_APPLICATION_NOTIFICATION_EMAIL;
  const employerEmail = employerEmailAddress
    ? sendEmail({
      to: employerEmailAddress,
      replyTo: application.email,
      subject: `New OrderPulse application: ${application.desiredPosition} — ${applicantName}`,
      text: [
        `New application ${application.applicationNumber}`,
        "",
        `Applicant: ${applicantName}`,
        `Position: ${application.desiredPosition}`,
        `Email: ${application.email}`,
        `Phone: ${application.phone}`,
        "",
        "Applicant message:",
        application.message || "(No message provided.)",
        "",
        "The applicant's CV is attached.",
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>New job application</h1><p><strong>Reference:</strong> ${escapeHtml(application.applicationNumber)}</p><p><strong>Applicant:</strong> ${escapeHtml(applicantName)}<br><strong>Position:</strong> ${escapeHtml(application.desiredPosition)}<br><strong>Email:</strong> ${escapeHtml(application.email)}<br><strong>Phone:</strong> ${escapeHtml(application.phone)}</p><h2>Applicant message</h2><p>${escapeHtml(application.message || "(No message provided.)").replace(/\n/g, "<br>")}</p><p>The applicant's CV is attached.</p></div>`,
      attachments: [{
        filename: application.resumeName,
        content: application.resumeData,
        contentType: application.resumeType,
        contentDisposition: "attachment",
      }],
      reference,
    })
    : Promise.resolve({
      status: "no_recipient",
      message: "Employer notification email is not configured.",
    });

  const [applicantEmailResult, employerEmailResult] = await Promise.all([applicantEmail, employerEmail]);
  return {
    applicantEmail: applicantEmailResult,
    employerEmail: employerEmailResult,
  };
}
