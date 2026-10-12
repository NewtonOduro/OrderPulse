import bcrypt from "bcryptjs";
import { db } from "./database.js";

function readManagerCredentials() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (
    typeof ADMIN_NAME !== "string" ||
    ADMIN_NAME.trim().length < 2 ||
    ADMIN_NAME.trim().length > 80 ||
    typeof ADMIN_EMAIL !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL.trim()) ||
    typeof ADMIN_PASSWORD !== "string" ||
    ADMIN_PASSWORD.length < 12 ||
    ADMIN_PASSWORD.length > 128
  ) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD between 12 and 128 characters.");
  }
  return {
    name: ADMIN_NAME.trim(),
    email: ADMIN_EMAIL.trim().toLowerCase(),
    password: ADMIN_PASSWORD,
  };
}

async function insertManager({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.run(`
    INSERT INTO users (name, email, password_hash, role, email_verified)
    VALUES (?, ?, ?, 'manager', TRUE)
  `, [name, email, passwordHash]);
}

export async function ensureManagerAccount() {
  if (!process.env.ADMIN_PASSWORD) return false;
  const credentials = readManagerCredentials();
  const existingManager = await db.get("SELECT id FROM users WHERE role = 'manager' LIMIT 1");
  if (existingManager) return false;
  try {
    await insertManager(credentials);
    return true;
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY" || error.code === "23505") {
      throw new Error("ADMIN_EMAIL is already in use. Set ADMIN_EMAIL to a new address and try again.");
    }
    throw error;
  }
}

export async function createManagerAccount() {
  const credentials = readManagerCredentials();
  const existingManager = await db.get("SELECT id FROM users WHERE role = 'manager' LIMIT 1");
  if (existingManager) throw new Error("A manager account already exists. Sign in and create staff accounts from the manager page.");
  await insertManager(credentials);
  return credentials.email;
}
