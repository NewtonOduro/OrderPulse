import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import featuredMenu from "./featured-menu.js";

const here = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DATABASE_PATH || resolve(here, "../../database/restaurant.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    price_pesewas INTEGER NOT NULL CHECK (price_pesewas >= 0),
    image_url TEXT NOT NULL,
    badge TEXT,
    available INTEGER NOT NULL DEFAULT 1,
    subcategory TEXT NOT NULL DEFAULT '',
    source_url TEXT,
    external_ref TEXT,
    stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    beverage_group TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL,
    order_type TEXT NOT NULL CHECK (order_type IN ('pickup', 'dine-in')),
    total_pesewas INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    item_name TEXT NOT NULL,
    unit_price_pesewas INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0)
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    booking_date TEXT NOT NULL,
    booking_time TEXT NOT NULL,
    party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
    notes TEXT NOT NULL DEFAULT '',
    table_id INTEGER REFERENCES restaurant_tables(id),
    status TEXT NOT NULL DEFAULT 'requested',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer', 'staff', 'manager')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS job_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE,
    phone TEXT NOT NULL,
    desired_position TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    resume_name TEXT NOT NULL,
    resume_type TEXT NOT NULL,
    resume_data BLOB NOT NULL,
    consent_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const orderColumns = db.prepare("PRAGMA table_info(orders)").all();
if (!orderColumns.some((column) => column.name === "customer_email")) {
  db.exec("ALTER TABLE orders ADD COLUMN customer_email TEXT NOT NULL DEFAULT ''");
}
if (!orderColumns.some((column) => column.name === "updated_at")) {
  db.exec("ALTER TABLE orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
}
db.exec("UPDATE orders SET updated_at = created_at WHERE updated_at = ''");

const menuColumns = db.prepare("PRAGMA table_info(menu_items)").all();
if (!menuColumns.some((column) => column.name === "subcategory")) {
  db.exec("ALTER TABLE menu_items ADD COLUMN subcategory TEXT NOT NULL DEFAULT ''");
}
if (!menuColumns.some((column) => column.name === "source_url")) {
  db.exec("ALTER TABLE menu_items ADD COLUMN source_url TEXT");
}
if (!menuColumns.some((column) => column.name === "external_ref")) {
  db.exec("ALTER TABLE menu_items ADD COLUMN external_ref TEXT");
}
if (!menuColumns.some((column) => column.name === "stock_quantity")) {
  db.exec("ALTER TABLE menu_items ADD COLUMN stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0)");
}
if (!menuColumns.some((column) => column.name === "low_stock_threshold")) {
  db.exec("ALTER TABLE menu_items ADD COLUMN low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0)");
}
if (!menuColumns.some((column) => column.name === "beverage_group")) {
  db.exec("ALTER TABLE menu_items ADD COLUMN beverage_group TEXT");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS menu_items_external_ref_unique ON menu_items(external_ref)");

const bookingColumns = db.prepare("PRAGMA table_info(bookings)").all();
if (!bookingColumns.some((column) => column.name === "table_id")) {
  db.exec("ALTER TABLE bookings ADD COLUMN table_id INTEGER REFERENCES restaurant_tables(id)");
}
if (!bookingColumns.some((column) => column.name === "customer_user_id")) {
  db.exec("ALTER TABLE bookings ADD COLUMN customer_user_id INTEGER REFERENCES users(id)");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS restaurant_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 20),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved'))
  );
`);

const menuCount = db.prepare("SELECT COUNT(*) AS count FROM menu_items").get().count;
if (menuCount === 0) {
  const seedMenu = db.prepare(`
    INSERT INTO menu_items (name, description, category, price_pesewas, image_url, badge, subcategory)
    VALUES (@name, @description, @category, @pricePesewas, @imageUrl, @badge, @subcategory)
  `);
  const items = [
    {
      name: "Jollof & grilled chicken",
      description: "Smoky party jollof, flame-grilled chicken, shito and a fresh side salad.",
      category: "Ghanaian",
      pricePesewas: 6800,
      imageUrl: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=85",
      badge: "Guest favourite",
      subcategory: "Ghanaian favourites",
    },
    {
      name: "Waakye bowl",
      description: "Rice and beans with gari, spaghetti, egg, ripe plantain and house shito.",
      category: "Ghanaian",
      pricePesewas: 5400,
      imageUrl: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=85",
      badge: "Local classic",
      subcategory: "Ghanaian favourites",
    },
    {
      name: "Crispy chicken burger",
      description: "Buttermilk chicken, slaw, pickles and our pepper mayo on a toasted bun.",
      category: "Burgers",
      pricePesewas: 6200,
      imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85",
      badge: "Best seller",
      subcategory: "International favourites",
    },
    {
      name: "Garden harvest salad",
      description: "Avocado, cherry tomatoes, crisp greens, toasted seeds and citrus dressing.",
      category: "Bowls",
      pricePesewas: 4800,
      imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85",
      badge: null,
      subcategory: "International favourites",
    },
    {
      name: "Spicy beef suya",
      description: "Charcoal-kissed beef skewers dusted with suya spice and served with onions.",
      category: "Grill",
      pricePesewas: 7500,
      imageUrl: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=900&q=85",
      badge: "Chef's pick",
      subcategory: "Ghanaian favourites",
    },
    {
      name: "Sobolo spritz",
      description: "Chilled hibiscus, ginger and lime with a little sparkle.",
      category: "Drinks",
      pricePesewas: 2200,
      imageUrl: "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b?auto=format&fit=crop&w=900&q=85",
      badge: null,
      subcategory: "Soft drinks",
    },
  ];
  const insertMany = db.transaction((menuItems) => menuItems.forEach((item) => seedMenu.run(item)));
  insertMany(items);
}

db.exec(`
  UPDATE menu_items
  SET subcategory = CASE
    WHEN category = 'Kenkey' THEN 'Kenkey'
    WHEN category = 'Abomu' THEN 'Abomu with plantains'
    WHEN category = 'Fufu' THEN 'Fufuo line'
    WHEN category = 'Banku' THEN 'Banku line'
    WHEN category = 'Red red' THEN 'Red red'
    WHEN category IN ('Pasta', 'Pizza', 'Mains') THEN 'International favourites'
    WHEN category = 'Wine' THEN 'Wine'
    ELSE subcategory
  END
  WHERE subcategory = '' AND category IN ('Kenkey', 'Abomu', 'Fufu', 'Banku', 'Red red', 'Pasta', 'Pizza', 'Mains', 'Wine');

  UPDATE menu_items
  SET category = CASE
    WHEN category IN ('Ghanaian', 'Grill', 'Kenkey', 'Abomu', 'Fufu', 'Banku', 'Red red') THEN 'Local food'
    WHEN category IN ('Burgers', 'Bowls', 'Pasta', 'Pizza', 'Mains') THEN 'Foreign food'
    WHEN category = 'Drinks' THEN 'Drinks'
    WHEN category = 'Wine' THEN 'Drinks'
    ELSE category
  END
  WHERE category IN ('Ghanaian', 'Grill', 'Burgers', 'Bowls', 'Pasta', 'Pizza', 'Mains', 'Kenkey', 'Abomu', 'Fufu', 'Banku', 'Red red', 'Wine', 'Drinks');
  UPDATE menu_items
  SET subcategory = CASE
    WHEN category = 'Local food' THEN 'Ghanaian favourites'
    WHEN category = 'Foreign food' THEN 'International favourites'
    WHEN category = 'Drinks' THEN 'Soft drinks'
    ELSE subcategory
  END
  WHERE subcategory = '';
`);

db.exec(`
  UPDATE menu_items
  SET beverage_group = CASE
    WHEN subcategory IN ('Wine', 'Beer', 'Spirits & Liquors', 'Cocktails') THEN 'Alcoholic Beverages'
    ELSE 'Non-Alcoholic Beverages'
  END,
  subcategory = CASE
    WHEN subcategory IN ('Wine', 'Beer', 'Spirits & Liquors', 'Cocktails') THEN subcategory
    WHEN subcategory = 'Soft drinks' THEN 'Cold & Soft Drinks'
    WHEN subcategory = 'Drinks' THEN 'Juices & Smoothies'
    ELSE subcategory
  END
  WHERE category = 'Drinks' AND (beverage_group IS NULL OR beverage_group = '');
`);

const insertFeatured = db.prepare(`
  INSERT INTO menu_items (
    name, description, category, price_pesewas, image_url, badge, subcategory, source_url, external_ref, beverage_group
  )
  VALUES (
    @name, @description, @category, @pricePesewas, @imageUrl, @badge, @subcategory, @sourceUrl, @externalRef, @beverageGroup
  )
  ON CONFLICT(external_ref) DO NOTHING
`);
const seedFeatured = db.transaction((items) => items.forEach((item) => insertFeatured.run(item)));
seedFeatured(featuredMenu);

const tableCount = db.prepare("SELECT COUNT(*) AS count FROM restaurant_tables").get().count;
if (tableCount === 0) {
  const insertTable = db.prepare("INSERT INTO restaurant_tables (name, seats) VALUES (?, ?)");
  const seedTables = db.transaction(() => {
    for (let number = 1; number <= 8; number += 1) {
      insertTable.run(`Table ${String(number).padStart(2, "0")}`, number <= 4 ? 2 : 4);
    }
    insertTable.run("Patio 01", 4);
    insertTable.run("Family table", 8);
  });
  seedTables();
}
