import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "./database.js";

const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

try {
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
    console.error("Set ADMIN_NAME, ADMIN_EMAIL, and a 12-character ADMIN_PASSWORD in Backend/.env before creating the manager account.");
    process.exitCode = 1;
  } else {
    const existingManager = await db.get("SELECT 1 FROM users WHERE role = 'manager' LIMIT 1");
    if (existingManager) {
      console.error("A manager account already exists. Sign in and create staff accounts from the manager page.");
      process.exitCode = 1;
    } else {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await db.run(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (?, ?, ?, 'manager')
      `, [ADMIN_NAME.trim(), ADMIN_EMAIL.trim().toLowerCase(), passwordHash]);
      console.log(`Manager account created for ${ADMIN_EMAIL.trim().toLowerCase()}. Remove ADMIN_PASSWORD from Backend/.env after setup.`);
    }
  }
} finally {
  await db.close();
}
