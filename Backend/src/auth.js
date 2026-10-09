import { createHash, randomBytes } from "node:crypto";
import { db } from "./database.js";

const sessionCookie = "greenplate_session";
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

function readSessionToken(request) {
  const cookieHeader = request.headers.cookie || "";
  const encoded = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`));
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded.slice(sessionCookie.length + 1));
  } catch {
    return null;
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

export async function setSession(response, userId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString();
  await db.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    userId,
    expiresAt,
  ]);
  response.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionLifetimeMs,
  });
}

export async function clearSession(request, response) {
  const token = readSessionToken(request);
  if (token) await db.run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  response.clearCookie(sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function requireUser(request, response, next) {
  const token = readSessionToken(request);
  if (!token) return response.status(401).json({ error: "Sign in to continue." });
  const user = await db.get(`
    SELECT u.id, u.name, u.email, u.phone, u.role, u.active
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `, [hashToken(token), new Date().toISOString()]);
  if (!user || !user.active) {
    await db.run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
    return response.status(401).json({ error: "Your session has expired. Sign in again." });
  }
  request.user = safeUser(user);
  return next();
}

export function requireCustomer(request, response, next) {
  if (request.user.role !== "customer") return response.status(403).json({ error: "Sign in with a customer account to reserve a table." });
  return next();
}

export function requireStaff(request, response, next) {
  if (!["staff", "manager"].includes(request.user.role)) {
    return response.status(403).json({ error: "This page is for restaurant staff." });
  }
  return next();
}

export function requireManager(request, response, next) {
  if (request.user.role !== "manager") return response.status(403).json({ error: "Manager access is required." });
  return next();
}

const actionLabel = (method, resource) => {
  if (resource === "tables") return method === "POST" ? "Added a restaurant table" : "Updated a table's service status";
  if (resource === "menu") {
    if (method === "POST") return "Added a menu item";
    if (method === "PUT") return "Edited a menu item";
    return "Changed menu item availability";
  }
  if (resource === "orders") return "Updated an order's status";
  if (resource === "reservations") return "Updated a reservation";
  if (resource === "team") return method === "POST" ? "Created a staff account" : "Changed a staff account's access";
  return "Updated restaurant operations";
};

export function auditStaffActivity(request, response, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
  const endResponse = response.end;
  let auditStarted = false;
  response.end = function (...args) {
    if (auditStarted || response.statusCode < 200 || response.statusCode >= 300 || !request.user) {
      return endResponse.apply(this, args);
    }
    auditStarted = true;
    const segments = request.originalUrl.split("?")[0].split("/").filter(Boolean);
    const apiIndex = segments.indexOf("api");
    const scope = segments[apiIndex + 1];
    const resource = scope === "staff" ? segments[apiIndex + 2] : segments[apiIndex + 2] === "staff" ? "team" : segments[apiIndex + 2];
    const entityId = scope === "staff" ? segments[apiIndex + 3] || null : segments[apiIndex + 3] || null;
    const body = request.body || {};
    const details = [
      typeof body.status === "string" ? `Status: ${body.status}` : null,
      typeof body.name === "string" ? `Name: ${body.name.trim().slice(0, 80)}` : null,
      typeof body.available === "boolean" ? `Available: ${body.available ? "yes" : "no"}` : null,
      typeof body.role === "string" ? `Role: ${body.role}` : null,
      Object.hasOwn(body, "stockQuantity") ? `Stock: ${body.stockQuantity === null ? "untracked" : body.stockQuantity}` : null,
      Number.isInteger(body.lowStockThreshold) ? `Low-stock alert: ${body.lowStockThreshold}` : null,
    ].filter(Boolean).join(" · ");
    db.run(`
      INSERT INTO activity_logs (user_id, actor_name, actor_email, action, entity, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      request.user.id,
      request.user.name,
      request.user.email,
      resource === "menu" && Object.hasOwn(body, "stockQuantity") ? "Updated menu stock" : actionLabel(request.method, resource),
      resource,
      entityId,
      details,
    ])
      .then(() => endResponse.apply(this, args))
      .catch((error) => {
        console.error("Failed to record staff activity:", error);
        endResponse.apply(this, args);
      });
    return this;
  };
  next();
}
