import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

test("PostgreSQL schema initializes and seeds the menu and tables", () => {
  const backendDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const script = `
    const { db } = await import("./src/database.js");
    const menu = await db.get("SELECT COUNT(*) AS count FROM menu_items");
    const tables = await db.get("SELECT COUNT(*) AS count FROM restaurant_tables");
    const categories = await db.all("SELECT category, COUNT(*) AS count FROM menu_items GROUP BY category");
    if (Number(menu.count) !== 35) throw new Error("Expected the 35 seeded menu items.");
    if (Number(tables.count) !== 6) throw new Error("Expected the 6 seeded restaurant tables.");
    const counts = Object.fromEntries(categories.map(({ category, count }) => [category, Number(count)]));
    if (counts["Local food"] !== 15 || counts["Foreign food"] !== 7 || counts.Drinks !== 13) {
      throw new Error("The seeded menu category counts were not preserved.");
    }
    await db.close();
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: backendDirectory,
    env: { ...process.env, PG_MEM_TEST: "1", DATABASE_URL: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
