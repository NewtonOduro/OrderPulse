import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("database startup migrates existing orders without losing their timestamps", () => {
  const directory = mkdtempSync(join(tmpdir(), "restaurant-migration-"));
  const databasePath = join(directory, "legacy.sqlite");
  const backendDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const script = `
    import Database from "better-sqlite3";
    const legacy = new Database(process.env.DATABASE_PATH);
    legacy.exec(\`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        order_type TEXT NOT NULL,
        total_pesewas INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'received',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE menu_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        price_pesewas INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        badge TEXT,
        available INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO orders (order_number, customer_name, phone, order_type, total_pesewas)
      VALUES ('GH-12345678', 'Legacy Guest', '0241234567', 'pickup', 100);
      INSERT INTO menu_items (name, description, category, price_pesewas, image_url)
      VALUES ('Legacy wine', 'A glass of wine.', 'Wine', 5000, 'https://example.com/wine.jpg');
    \`);
    legacy.close();
    const { db } = await import("./src/database.js");
    const order = db.prepare("SELECT created_at, updated_at FROM orders WHERE order_number = ?").get("GH-12345678");
    if (!order || order.updated_at !== order.created_at) {
      throw new Error("Legacy order timestamp was not preserved during migration.");
    }
    const wine = db.prepare("SELECT category, subcategory, beverage_group FROM menu_items WHERE name = ?").get("Legacy wine");
    if (
      wine?.category !== "Drinks" ||
      wine.subcategory !== "Wine" ||
      wine.beverage_group !== "Alcoholic Beverages"
    ) {
      throw new Error("Legacy wine was not migrated into the drinks hierarchy.");
    }
    db.close();
  `;

  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: backendDirectory,
      env: { ...process.env, DATABASE_PATH: databasePath },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
