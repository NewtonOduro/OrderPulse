import nodemailer from "nodemailer";
import { randomBytes } from "node:crypto";

const resendEndpoint = "https://api.resend.com/emails";
const gmailTokenEndpoint = "https://oauth2.googleapis.com/token";
const gmailSendEndpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
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

let cachedGmailAccessToken = "";
let cachedGmailTokenExpiry = 0;

function encodeMimeHeader(value) {
  const safeValue = String(value).replace(/[\r\n]/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(safeValue)
    ? safeValue
    : `=?UTF-8?B?${Buffer.from(safeValue).toString("base64")}?=`;
}

function encodeMimeBody(value) {
  return Buffer.from(String(value)).toString("base64").replace(/.{1,76}/g, "$&\r\n").trim();
}

async function getGmailAccessToken(reference) {
  if (cachedGmailAccessToken && Date.now() < cachedGmailTokenExpiry - 60_000) {
    return cachedGmailAccessToken;
  }
  const response = await fetch(gmailTokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    throw new Error("GMAIL_AUTH_FAILED");
  }
  cachedGmailAccessToken = result.access_token;
  cachedGmailTokenExpiry = Date.now() + (Number(result.expires_in) || 3600) * 1000;
  return cachedGmailAccessToken;
}

function createRawEmail({ to, from, subject, text, html, replyTo, attachments }) {
  const boundary = `orderpulse_${randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${String(from).replace(/[\r\n]/g, " ")}`,
    `To: ${String(to).replace(/[\r\n]/g, " ")}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    ...(replyTo ? [`Reply-To: ${String(replyTo).replace(/[\r\n]/g, " ")}`] : []),
    "MIME-Version: 1.0",
  ];
  const alternativeBoundary = `${boundary}_alternative`;
  const bodyParts = attachments?.length
    ? [
      `--${boundary}`,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      "",
      `--${alternativeBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeMimeBody(text),
      `--${alternativeBoundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeMimeBody(html),
      `--${alternativeBoundary}--`,
      ...attachments.flatMap((attachment) => [
        `--${boundary}`,
        `Content-Type: ${String(attachment.contentType || "application/octet-stream").replace(/[\r\n]/g, "")}`,
        `Content-Disposition: attachment; filename="${String(attachment.filename).replace(/["\r\n]/g, "_")}"`,
        "Content-Transfer-Encoding: base64",
        "",
        encodeMimeBody(attachment.content),
      ]),
      `--${boundary}--`,
    ].join("\r\n")
    : [
      `--${alternativeBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeMimeBody(text),
      `--${alternativeBoundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      encodeMimeBody(html),
      `--${alternativeBoundary}--`,
    ].join("\r\n");

  if (attachments?.length) headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  else headers.push(`Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`);
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${bodyParts}`)
    .toString("base64url");
}

async function sendGmailEmail({ to, from, subject, text, html, reference, replyTo, attachments }) {
  const config = {
    GMAIL_USER: process.env.GMAIL_USER,
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN,
  };
  const notReady = configurationStatus(config, Object.keys(config), "Gmail API");
  if (notReady) {
    console.error(`Email delivery unavailable for ${reference}: ${notReady.message}`);
    return notReady;
  }
  try {
    const accessToken = await getGmailAccessToken(reference);
    const raw = createRawEmail({
      to,
      from: from || config.GMAIL_USER,
      subject,
      text,
      html,
      replyTo,
      attachments,
    });
    const response = await fetch(gmailSendEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.error(`Email delivery failed for ${reference} via Gmail API: HTTP ${response.status}`);
      return { status: "failed", message: "Email could not be sent. Check the Gmail API OAuth settings and server logs." };
    }
    return { status: "sent", message: "Email sent." };
  } catch (error) {
    cachedGmailAccessToken = "";
    cachedGmailTokenExpiry = 0;
    console.error(`Email delivery failed for ${reference} via Gmail API:`, error.message);
    return { status: "failed", message: "Email could not be sent. Check the Gmail API OAuth settings and server logs." };
  }
}

async function sendEmail({ to, subject, text, html, reference, replyTo, attachments }) {
  if (typeof to !== "string" || !to.trim()) {
    return { status: "no_recipient", message: "No email address is available for this notification." };
  }

  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM;
  if (
    process.env.GMAIL_USER ||
    process.env.GMAIL_CLIENT_ID ||
    process.env.GMAIL_CLIENT_SECRET ||
    process.env.GMAIL_REFRESH_TOKEN
  ) {
    return sendGmailEmail({ to, from: process.env.GMAIL_USER, subject, text, html, reference, replyTo, attachments });
  }

  if (process.env.RESEND_API_KEY) {
    if (!from) {
      const result = { status: "failed", message: "EMAIL_FROM must be set to a verified sender address." };
      console.error(`Email delivery unavailable for ${reference}: ${result.message}`);
      return result;
    }
    try {
      const response = await fetch(resendEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(attachments ? {
            attachments: attachments.map((attachment) => ({
              filename: attachment.filename,
              ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
              content: Buffer.isBuffer(attachment.content)
                ? attachment.content.toString("base64")
                : Buffer.from(attachment.content).toString("base64"),
            })),
          } : {}),
        }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const detail = typeof errorBody.message === "string" ? errorBody.message : `HTTP ${response.status}`;
        console.error(`Email delivery failed for ${reference} via Resend: ${detail}`);
        return { status: "failed", message: "Email could not be sent. Check the Resend settings and server logs." };
      }
      return { status: "sent", message: "Email sent." };
    } catch (error) {
      console.error(`Email delivery failed for ${reference} via Resend:`, error.message);
      return { status: "failed", message: "Email could not be sent. Check the Resend settings and server logs." };
    }
  }

  const config = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: from,
  };
  const notReady = configurationStatus(config, Object.keys(config), "Email");
  if (notReady) {
    console.error(`Email delivery unavailable for ${reference}: ${notReady.message}`);
    return notReady;
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
      from,
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

function authenticationLink(parameter, token) {
  const configuredUrl = process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5173";
  try {
    const url = new URL(configuredUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    url.searchParams.set(parameter, token);
    return url.toString();
  } catch {
    return null;
  }
}

export async function sendVerificationEmail({ email, name, token }) {
  const link = authenticationLink("verifyEmail", token);
  if (!link) return { status: "failed", message: "PUBLIC_APP_URL must be a valid HTTP or HTTPS URL." };
  return sendEmail({
    to: email,
    subject: "Verify your OrderPulse email",
    text: [
      `Hello ${name},`,
      "",
      "Verify your email address to activate your OrderPulse account:",
      link,
      "",
      "This link expires in 24 hours. If you did not create this account, you can ignore this email.",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(name)},</p><p>Verify your email address to activate your account.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#193d2d;color:white;padding:12px 20px;border-radius:24px;text-decoration:none">Verify email</a></p><p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p></div>`,
    reference: "email verification",
  });
}

export async function sendPasswordResetEmail({ email, name, token }) {
  const link = authenticationLink("resetPassword", token);
  if (!link) return { status: "failed", message: "PUBLIC_APP_URL must be a valid HTTP or HTTPS URL." };
  return sendEmail({
    to: email,
    subject: "Reset your OrderPulse password",
    text: [
      `Hello ${name},`,
      "",
      "Use this link to choose a new OrderPulse password:",
      link,
      "",
      "This link expires in one hour. If you did not request a password reset, you can ignore this email.",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(name)},</p><p>Use the link below to choose a new password.</p><p><a href="${escapeHtml(link)}" style="display:inline-block;background:#193d2d;color:white;padding:12px 20px;border-radius:24px;text-decoration:none">Reset password</a></p><p>This link expires in one hour. If you did not request a password reset, you can ignore this email.</p></div>`,
    reference: "password reset",
  });
}

export async function sendPaymentConfirmationEmail({ email, customerName, orderNumber, total }) {
  const formattedTotal = formatMoney(total);
  const text = [
    `Hello ${customerName},`,
    "",
    `Payment for order ${orderNumber} has been confirmed.`,
    `Amount confirmed: ${formattedTotal}`,
    "The restaurant team can now begin preparing your order.",
    "",
    "Thank you for choosing OrderPulse.",
  ].join("\n");
  return sendEmail({
    to: email,
    subject: `Payment confirmed for OrderPulse order ${orderNumber}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(customerName)},</p><p>Payment for order <strong>${escapeHtml(orderNumber)}</strong> has been confirmed.</p><p>Amount confirmed: <strong>${formattedTotal}</strong></p><p>The restaurant team can now begin preparing your order.</p><p>Thank you for choosing OrderPulse.</p></div>`,
    reference: `payment confirmation for order ${orderNumber}`,
  });
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
    "Complete payment securely through Paystack:",
    order.paymentUrl || "Return to the OrderPulse checkout page to continue payment.",
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
      html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse · Ahodwo, Kumasi</h1><p>Hello ${escapeHtml(order.customerName)},</p><p>We received order <strong>${escapeHtml(order.orderNumber)}</strong> (${order.orderType === "dine-in" ? "Dine in" : "Pickup"}).</p><ul>${htmlItems}</ul><p><strong>Total: ${formatMoney(order.total)}</strong></p><p>Status: ${escapeHtml(order.status)}</p><h2>Complete your payment</h2><p><a href="${escapeHtml(order.paymentUrl || "#")}">Continue to secure Paystack checkout</a></p><p>Your order will be released to the kitchen once payment is verified.</p><p>Thank you for choosing OrderPulse.</p></div>`,
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
        "",
        "Payment: Paystack",
        `Payment status: ${order.paymentStatus || "pending"}`,
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
    "OrderPulse · Ahodwo, Kumasi",
  ].filter((line) => line !== null).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(reservation.customerName)},</p><p>${escapeHtml(statusMessage)}</p><p><strong>Date:</strong> ${escapeHtml(reservation.date)} at ${escapeHtml(reservation.time)}<br><strong>Guests:</strong> ${reservation.partySize}${reservation.tableName ? `<br><strong>Table:</strong> ${escapeHtml(reservation.tableName)}` : ""}</p>${reservation.notes ? `<p><strong>Your note:</strong> ${escapeHtml(reservation.notes)}</p>` : ""}<p>OrderPulse · Ahodwo, Kumasi</p></div>`;
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
      "OrderPulse · Ahodwo, Kumasi",
    ].join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#193d2d;max-width:560px;margin:auto"><h1>OrderPulse</h1><p>Hello ${escapeHtml(application.firstName)},</p><p>We received your application for the <strong>${escapeHtml(application.desiredPosition)}</strong> position.</p><p>Your application reference is <strong>${escapeHtml(application.applicationNumber)}</strong>.</p><p>Our team will review your application and contact you if we need more information.</p><p>OrderPulse · Ahodwo, Kumasi</p></div>`,
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
