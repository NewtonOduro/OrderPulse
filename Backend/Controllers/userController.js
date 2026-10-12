import bcrypt from "bcryptjs";
import { db } from "../database/database.js";
import { consumeEmailAuthToken, createEmailAuthToken } from "../services/email-auth.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/order-notifications.js";
import { clearSession, safeUser, setSession } from "../middleware/auth.js";
import { emailPattern, minimumPasswordLength, validText } from "./shared.js";

export const register = async (request, response) => {
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
      INSERT INTO users (name, email, phone, password_hash, role, email_verified)
      VALUES (?, ?, ?, ?, 'customer', FALSE)
    `, [name.trim(), email.trim().toLowerCase(), phone.trim(), passwordHash]);
    const user = await db.get("SELECT id, name, email, phone, role FROM users WHERE id = ?", [result.lastInsertRowid]);
    const token = await createEmailAuthToken(user.id, "verify_email");
    const verificationEmail = await sendVerificationEmail({ email: user.email, name: user.name, token });
    return response.status(201).json({
      message: "Account created. Check your email for a link to verify your address before signing in.",
      verificationEmail,
    });
  } catch (error) {
    if (["23505", "ER_DUP_ENTRY"].includes(error.code)) return response.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    throw error;
  }
};


export const login = async (request, response) => {
  const { email, password } = request.body ?? {};
  if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || password.length > 128) {
    return response.status(400).json({ error: "Enter your email address and password." });
  }
  const user = await db.get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email.trim().toLowerCase()]);
  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    return response.status(401).json({ error: "The email or password is incorrect." });
  }
  if (!user.email_verified) {
    return response.status(403).json({
      error: "Verify your email before signing in. Check your inbox or request a fresh verification email.",
      code: "EMAIL_NOT_VERIFIED",
    });
  }
  await setSession(response, user.id);
  return response.json({ user: safeUser(user) });
};


export const verifyEmail = async (request, response) => {
  const { token } = request.body ?? {};
  const user = await consumeEmailAuthToken(token, "verify_email", async (transaction, verifiedUser) => {
    await transaction.run("UPDATE users SET email_verified = TRUE WHERE id = ?", [verifiedUser.id]);
  });
  if (!user) return response.status(400).json({ error: "This verification link is invalid, expired, or already used. Request a new link and try again." });
  return response.json({ message: "Email verified. You can now sign in.", email: user.email });
};


export const resendVerification = async (request, response) => {
  const email = request.body?.email;
  if (typeof email === "string" && email.length <= 254 && emailPattern.test(email.trim())) {
    const user = await db.get(`
      SELECT id, name, email FROM users
      WHERE LOWER(email) = LOWER(?) AND active = TRUE AND email_verified = FALSE
    `, [email.trim().toLowerCase()]);
    if (user) {
      const token = await createEmailAuthToken(user.id, "verify_email");
      const sent = await sendVerificationEmail({ email: user.email, name: user.name, token });
      if (sent.status !== "sent") console.error(`Verification email not sent: ${sent.status} - ${sent.message}`);
    }
  }
  return response.status(202).json({
    message: "If that account needs email verification, a fresh link will be sent to its address.",
  });
};


export const forgotPassword = async (request, response) => {
  const email = request.body?.email;
  if (typeof email === "string" && email.length <= 254 && emailPattern.test(email.trim())) {
    const user = await db.get(`
      SELECT id, name, email FROM users
      WHERE LOWER(email) = LOWER(?) AND active = TRUE
    `, [email.trim().toLowerCase()]);
    if (user) {
      const token = await createEmailAuthToken(user.id, "reset_password");
      const sent = await sendPasswordResetEmail({ email: user.email, name: user.name, token });
      if (sent.status !== "sent") console.error(`Password reset email not sent: ${sent.status} - ${sent.message}`);
    }
  }
  return response.status(202).json({
    message: "If an active account uses that email, a password reset link will be sent.",
  });
};


export const resetPassword = async (request, response) => {
  const { token, password } = request.body ?? {};
  if (typeof password !== "string" || password.length < minimumPasswordLength || password.length > 128) {
    return response.status(400).json({ error: "Choose a password with at least 12 characters." });
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await consumeEmailAuthToken(token, "reset_password", async (transaction, resetUser) => {
    await transaction.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, resetUser.id]);
    await transaction.run("DELETE FROM sessions WHERE user_id = ?", [resetUser.id]);
  });
  if (!user) return response.status(400).json({ error: "This password reset link is invalid, expired, or already used. Request a new link and try again." });
  return response.json({ message: "Password reset. Sign in with your new password.", email: user.email });
};


export const logout = async (request, response) => {
  await clearSession(request, response);
  return response.status(204).end();
};


export const customerReservations = async (request, response) => {
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
};



export const currentUser = (request, response) => response.json({ user: request.user });
