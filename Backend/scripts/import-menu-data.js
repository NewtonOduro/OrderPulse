import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidMenuPlacement } from "../src/menu-categories.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(scriptDirectory, "../.env") });

const sqlitePath = resolve(
  process.argv[2] || resolve(scriptDirectory, "../../database/restaurant.sqlite"),
);
const pythonScript = `
import json
import re
import sqlite3
import sys
from pathlib import Path

database_uri = Path(sys.argv[1]).resolve().as_uri() + "?mode=ro"
connection = sqlite3.connect(database_uri, uri=True)
connection.row_factory = sqlite3.Row

def records(table):
    return [dict(row) for row in connection.execute('SELECT * FROM "' + table + '"')]

menu_columns = {column[1] for column in connection.execute("PRAGMA table_info(menu_items)")}
required_menu_columns = {"id", "name", "description", "category", "price_pesewas", "image_url"}
missing_columns = required_menu_columns - menu_columns
if missing_columns:
    raise RuntimeError("The SQLite menu schema is missing required columns: " + ", ".join(sorted(missing_columns)))

menu = []
for row in records("menu_items"):
    menu.append({
        "sourceId": row["id"],
        "name": row["name"],
        "description": row["description"],
        "category": row["category"],
        "pricePesewas": row["price_pesewas"],
        "imageUrl": row["image_url"],
        "badge": row.get("badge"),
        "available": bool(row.get("available", 1)),
        "subcategory": row.get("subcategory") or "",
        "sourceUrl": row.get("source_url"),
        "externalRef": row.get("external_ref") or None,
        "stockQuantity": row.get("stock_quantity"),
        "lowStockThreshold": row.get("low_stock_threshold", 5),
        "beverageGroup": row.get("beverage_group"),
    })

def normalized_name(name):
    return re.sub(r"\\s+", " ", name.strip()).casefold()

grouped = {}
for item in menu:
    grouped.setdefault(normalized_name(item["name"]), []).append(item)

unique_menu = [
    max(items, key=lambda item: (item["available"], item["sourceId"]))
    for items in grouped.values()
]
for item in unique_menu:
    item.pop("sourceId")

table_columns = {column[1] for column in connection.execute("PRAGMA table_info(restaurant_tables)")}
required_table_columns = {"id", "name", "seats"}
missing_columns = required_table_columns - table_columns
if missing_columns:
    raise RuntimeError("The SQLite table schema is missing required columns: " + ", ".join(sorted(missing_columns)))

tables = [{
    "name": row["name"],
    "seats": row["seats"],
    "status": row.get("status") or "available",
} for row in records("restaurant_tables")]
connection.close()
print(json.dumps({
    "menu": unique_menu,
    "tables": tables,
    "duplicatesRemoved": len(menu) - len(unique_menu),
}))
`;

const pythonCommand = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");
const exportResult = spawnSync(pythonCommand, ["-c", pythonScript, sqlitePath], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
});
if (exportResult.error) throw exportResult.error;
if (exportResult.status !== 0) {
  throw new Error(exportResult.stderr.trim() || "Unable to read the SQLite menu and table data.");
}

const { menu, tables, duplicatesRemoved } = JSON.parse(exportResult.stdout);
if (menu.length === 0 || tables.length === 0) {
  throw new Error("The SQLite database must contain at least one menu item and one restaurant table.");
}
const duplicateReferences = new Set();
for (const item of menu) {
  if (
    typeof item.name !== "string" ||
    !item.name.trim() ||
    !Number.isInteger(item.pricePesewas) ||
    item.pricePesewas < 0 ||
    !isValidMenuPlacement(item.category, item.beverageGroup, item.subcategory) ||
    (item.stockQuantity !== null && (!Number.isInteger(item.stockQuantity) || item.stockQuantity < 0))
  ) {
    throw new Error(`The menu item "${item.name}" has invalid price, category, or stock data; no records were imported.`);
  }
  if (item.externalRef && duplicateReferences.has(item.externalRef)) {
    throw new Error("The local menu contains duplicate reference IDs; no records were imported.");
  }
  if (item.externalRef) duplicateReferences.add(item.externalRef);
}
for (const table of tables) {
  if (
    typeof table.name !== "string" ||
    !table.name.trim() ||
    !Number.isInteger(table.seats) ||
    table.seats < 1 ||
    table.seats > 20 ||
    !["available", "occupied", "reserved"].includes(table.status)
  ) {
    throw new Error(`Restaurant table "${table.name}" has invalid capacity or status; no records were imported.`);
  }
}

if (!process.env.PG_MEM_TEST && !process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL in Backend/.env to the Neon PostgreSQL connection string before importing.");
}

process.env.PG_SKIP_SEED = "1";
const { db } = await import("../src/database.js");

try {
  await db.transaction(async (tx) => {
    const protectedTables = ["users", "orders", "order_items", "bookings", "sessions", "activity_logs", "job_applications"];
    for (const table of protectedTables) {
      const count = await tx.get(`SELECT COUNT(*) AS count FROM ${table}`);
      if (Number(count.count) !== 0) {
        throw new Error(`Neon already contains ${table} data. This import only runs against an unused database.`);
      }
    }

    const existingMenu = await tx.get("SELECT COUNT(*) AS count FROM menu_items");
    const existingTables = await tx.get("SELECT COUNT(*) AS count FROM restaurant_tables");
    if (Number(existingMenu.count) !== 0 || Number(existingTables.count) !== 0) {
      throw new Error("Neon must have an empty menu and no restaurant tables before importing local data.");
    }

    for (const item of menu) {
      await tx.run(`
        INSERT INTO menu_items (
          name, description, category, price_pesewas, image_url, badge, available,
          subcategory, source_url, external_ref, stock_quantity, low_stock_threshold, beverage_group
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.name,
        item.description,
        item.category,
        item.pricePesewas,
        item.imageUrl,
        item.badge,
        item.available,
        item.subcategory,
        item.sourceUrl,
        item.externalRef,
        item.stockQuantity,
        item.lowStockThreshold,
        item.beverageGroup,
      ]);
    }

    for (const table of tables) {
      await tx.run(
        "INSERT INTO restaurant_tables (name, seats, status) VALUES (?, ?, ?)",
        [table.name, table.seats, table.status],
      );
    }
  });
  console.log(`Imported ${menu.length} menu items and ${tables.length} restaurant tables. Removed ${duplicatesRemoved} duplicate menu entries using availability, then newest record as the tie-breaker.`);
} finally {
  await db.close();
}
