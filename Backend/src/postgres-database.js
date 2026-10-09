import { Pool } from "pg";
import featuredMenu from "./featured-menu.js";

function toPostgresPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function createDatabaseAdapter(pool) {
  async function execute(client, sql, params = [], mode = "many") {
    const statement = toPostgresPlaceholders(sql);
    const shouldReturnId = /^\s*INSERT\s+INTO\s+(?!sessions\b)/i.test(sql);
    const query = shouldReturnId && !/\bRETURNING\b/i.test(statement)
      ? `${statement.trim().replace(/;$/, "")} RETURNING id`
      : statement;
    const result = await client.query(query, params);
    if (mode === "many") return result.rows;
    if (mode === "one") return result.rows[0] ?? null;
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows[0]?.id ?? null,
      row: result.rows[0] ?? null,
    };
  }

  return {
    all: (sql, params = []) => execute(pool, sql, params),
    get: (sql, params = []) => execute(pool, sql, params, "one"),
    run: (sql, params = []) => execute(pool, sql, params, "run"),
    async transaction(callback) {
      const client = await pool.connect();
      const tx = {
        all: (sql, params = []) => execute(client, sql, params),
        get: (sql, params = []) => execute(client, sql, params, "one"),
        run: (sql, params = []) => execute(client, sql, params, "run"),
      };
      try {
        await client.query("BEGIN");
        const result = await callback(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPool() {
  if (process.env.PG_MEM_TEST === "1") {
    const { newDb } = await import("pg-mem");
    const memoryDatabase = newDb({ autoCreateForeignKeyIndices: true });
    const { Pool: MemoryPool } = memoryDatabase.adapters.createPg();
    return new MemoryPool();
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Set it to a PostgreSQL connection string before starting OrderPulse.");
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE) || 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

const schema = `
  CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    price_pesewas INTEGER NOT NULL CHECK (price_pesewas >= 0),
    image_url TEXT NOT NULL,
    badge TEXT,
    available BOOLEAN NOT NULL DEFAULT TRUE,
    subcategory TEXT NOT NULL DEFAULT '',
    source_url TEXT,
    external_ref TEXT UNIQUE,
    stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    beverage_group TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL,
    order_type TEXT NOT NULL CHECK (order_type IN ('pickup', 'dine-in')),
    total_pesewas INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    item_name TEXT NOT NULL,
    unit_price_pesewas INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0)
  );

  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('customer', 'staff', 'manager')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS email_auth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS restaurant_tables (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 20),
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    booking_date TEXT NOT NULL,
    booking_time TEXT NOT NULL,
    party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
    notes TEXT NOT NULL DEFAULT '',
    table_id INTEGER REFERENCES restaurant_tables(id),
    customer_user_id INTEGER REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'requested',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    actor_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS job_applications (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    desired_position TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    resume_name TEXT NOT NULL,
    resume_type TEXT NOT NULL,
    resume_data BYTEA NOT NULL,
    consent_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

async function seedDatabase(db) {
  const initialMenu = [
    ["Jollof & grilled chicken", "Smoky party jollof, flame-grilled chicken, shito and a fresh side salad.", "Local food", 6800, "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=85", "Guest favourite", "Ghanaian favourites", null],
    ["Waakye bowl", "Rice and beans with gari, spaghetti, egg, ripe plantain and house shito.", "Local food", 5400, "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=85", "Local classic", "Ghanaian favourites", null],
    ["Crispy chicken burger", "Buttermilk chicken, slaw, pickles and our pepper mayo on a toasted bun.", "Foreign food", 6200, "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85", "Best seller", "International favourites", null],
    ["Garden harvest salad", "Avocado, cherry tomatoes, crisp greens, toasted seeds and citrus dressing.", "Foreign food", 4800, "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85", null, "International favourites", null],
    ["Spicy beef suya", "Charcoal-kissed beef skewers dusted with suya spice and served with onions.", "Local food", 7500, "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=900&q=85", "Chef's pick", "Ghanaian favourites", null],
    ["Sobolo spritz", "Chilled hibiscus, ginger and lime with a little sparkle.", "Drinks", 2200, "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b?auto=format&fit=crop&w=900&q=85", null, "Cold & Soft Drinks", "Non-Alcoholic Beverages"],
  ];
  const itemCount = await db.get("SELECT COUNT(*) AS count FROM menu_items");
  if (Number(itemCount.count) === 0) {
    for (const [name, description, category, price, imageUrl, badge, subcategory, beverageGroup] of initialMenu) {
      await db.run(`
        INSERT INTO menu_items (name, description, category, price_pesewas, image_url, badge, subcategory, beverage_group)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [name, description, category, price, imageUrl, badge, subcategory, beverageGroup]);
    }
  }

  for (const item of featuredMenu) {
    const existingItem = await db.get(
      "SELECT id FROM menu_items WHERE LOWER(name) = LOWER(?) OR external_ref = ?",
      [item.name, item.externalRef],
    );
    if (existingItem) continue;
    await db.run(`
      INSERT INTO menu_items (
        name, description, category, price_pesewas, image_url, badge, subcategory, source_url, external_ref, beverage_group
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_ref) DO NOTHING
    `, [
      item.name,
      item.description,
      item.category,
      item.pricePesewas,
      item.imageUrl,
      item.badge,
      item.subcategory,
      item.sourceUrl,
      item.externalRef,
      item.beverageGroup,
    ]);
  }

  const tableCount = await db.get("SELECT COUNT(*) AS count FROM restaurant_tables");
  if (Number(tableCount.count) === 0) {
    for (const [name, seats] of [["Table 1", 2], ["Table 2", 2], ["Table 3", 4], ["Table 4", 4], ["Table 5", 6], ["Table 6", 8]]) {
      await db.run("INSERT INTO restaurant_tables (name, seats) VALUES (?, ?)", [name, seats]);
    }
  }
}

const pool = await createPool();
export const db = createDatabaseAdapter(pool);
await pool.query(schema);
await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE");
if (process.env.PG_SKIP_SEED !== "1") await seedDatabase(db);
