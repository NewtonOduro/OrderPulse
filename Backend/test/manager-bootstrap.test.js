import { after, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

process.env.PG_MEM_TEST = "1";
process.env.ADMIN_NAME = "Initial Manager";
process.env.ADMIN_EMAIL = "initial.manager@example.com";
process.env.ADMIN_PASSWORD = "initial-manager-password-123";

const { ensureManagerAccount } = await import("../src/manager-bootstrap.js");
const { db } = await import("../src/database.js");

after(async () => {
  await db.close();
});

test("creates the first verified manager once from environment credentials", async () => {
  assert.equal(await ensureManagerAccount(), true);
  assert.equal(await ensureManagerAccount(), false);

  const manager = await db.get(
    "SELECT name, email, password_hash, role, email_verified FROM users WHERE email = ?",
    ["initial.manager@example.com"],
  );
  assert.equal(manager.name, "Initial Manager");
  assert.equal(manager.role, "manager");
  assert.equal(manager.email_verified, true);
  assert.equal(await bcrypt.compare("initial-manager-password-123", manager.password_hash), true);
});
