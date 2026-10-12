import { createHash, randomBytes } from "node:crypto";
import { db } from "../database/database.js";

const tokenLifetimes = {
  verify_email: 30 * 1000,
  reset_password: 60 * 60 * 1000,
};

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createEmailAuthToken(userId, purpose) {
  const lifetime = tokenLifetimes[purpose];
  if (!lifetime) throw new Error("Unsupported email authentication token purpose.");

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction.run(`
      INSERT INTO email_auth_tokens (user_id, purpose, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `, [userId, purpose, hashToken(token), new Date(now.getTime() + lifetime).toISOString()]);
  });
  return token;
}

export async function revokeOtherEmailAuthTokens(userId, purpose, token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token) || !tokenLifetimes[purpose]) {
    throw new Error("Invalid email authentication token.");
  }
  await db.run(`
    UPDATE email_auth_tokens SET used_at = ?
    WHERE user_id = ? AND purpose = ? AND token_hash != ? AND used_at IS NULL
  `, [new Date().toISOString(), userId, purpose, hashToken(token)]);
}

export async function consumeEmailAuthToken(token, purpose, updateUser) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token) || !tokenLifetimes[purpose]) return null;

  const now = new Date().toISOString();
  return db.transaction(async (transaction) => {
    const tokenRecord = await transaction.get(`
      SELECT user_id FROM email_auth_tokens
      WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?
      FOR UPDATE
    `, [hashToken(token), purpose, now]);
    if (!tokenRecord) return null;
    const consumed = await transaction.run(`
      UPDATE email_auth_tokens SET used_at = ?
      WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?
    `, [now, hashToken(token), purpose, now]);
    if (consumed.changes !== 1) return null;

    const user = await transaction.get("SELECT id, email, active FROM users WHERE id = ?", [tokenRecord.user_id]);
    if (!user || !user.active) return null;
    await updateUser(transaction, user, now);
    await transaction.run(`
      UPDATE email_auth_tokens SET used_at = ?
      WHERE user_id = ? AND purpose = ? AND used_at IS NULL
    `, [now, user.id, purpose]);
    return user;
  });
}
