import mysql from "mysql2/promise";
import { seedDatabase } from "../seeds/database-seed.js";

function normalizeParameter(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    return new Date(value);
  }
  return value;
}

function createDatabaseAdapter(pool) {
  async function execute(connection, sql, params = [], mode = "many") {
    const [result] = await connection.execute(sql, params.map(normalizeParameter));
    if (mode === "many") return result;
    if (mode === "one") return result[0] ?? null;
    return {
      changes: result.affectedRows,
      lastInsertRowid: result.insertId || null,
      row: null,
    };
  }

  return {
    all: (sql, params = []) => execute(pool, sql, params),
    get: (sql, params = []) => execute(pool, sql, params, "one"),
    run: (sql, params = []) => execute(pool, sql, params, "run"),
    async transaction(callback) {
      const connection = await pool.getConnection();
      const tx = {
        all: (sql, params = []) => execute(connection, sql, params),
        get: (sql, params = []) => execute(connection, sql, params, "one"),
        run: (sql, params = []) => execute(connection, sql, params, "run"),
      };
      try {
        await connection.beginTransaction();
        const result = await callback(tx);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    close: () => pool.end(),
  };
}

const schema = `
  CREATE TABLE IF NOT EXISTS menu_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(80) NOT NULL,
    price_pesewas INT NOT NULL CHECK (price_pesewas >= 0),
    image_url VARCHAR(1000) NOT NULL,
    badge VARCHAR(255),
    available BOOLEAN NOT NULL DEFAULT TRUE,
    subcategory VARCHAR(80) NOT NULL DEFAULT '',
    source_url VARCHAR(1000),
    external_ref VARCHAR(255) UNIQUE,
    stock_quantity INT CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
    low_stock_threshold INT NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    beverage_group VARCHAR(80)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS orders (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL UNIQUE,
    customer_name VARCHAR(120) NOT NULL,
    customer_email VARCHAR(254) NOT NULL DEFAULT '',
    phone VARCHAR(40) NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    total_pesewas BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'received',
    payment_status VARCHAR(24) NOT NULL DEFAULT 'paid',
    payment_reference VARCHAR(120) UNIQUE,
    customer_user_id INT UNSIGNED,
    table_id INT UNSIGNED,
    delivery_address VARCHAR(500),
    delivery_area VARCHAR(120),
    delivery_fee_pesewas INT NOT NULL DEFAULT 0,
    deal_code VARCHAR(40),
    deal_discount_pesewas INT NOT NULL DEFAULT 0,
    rewards_points_used INT NOT NULL DEFAULT 0,
    rewards_discount_pesewas INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS delivery_areas (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    area_name VARCHAR(120) NOT NULL UNIQUE,
    fee_pesewas INT NOT NULL DEFAULT 0 CHECK (fee_pesewas >= 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS restaurant_deals (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL,
    code VARCHAR(40) NOT NULL UNIQUE,
    discount_pesewas INT NOT NULL CHECK (discount_pesewas > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at DATETIME(3),
    ends_at DATETIME(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS meal_bundles (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL,
    price_pesewas INT NOT NULL CHECK (price_pesewas > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at DATETIME(3),
    ends_at DATETIME(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS meal_bundle_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    bundle_id INT UNSIGNED NOT NULL,
    menu_item_id INT UNSIGNED NOT NULL,
    quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    UNIQUE KEY uq_meal_bundle_item (bundle_id, menu_item_id),
    CONSTRAINT fk_meal_bundle_items_bundle FOREIGN KEY (bundle_id) REFERENCES meal_bundles(id) ON DELETE CASCADE,
    CONSTRAINT fk_meal_bundle_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS order_meal_bundles (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL,
    meal_bundle_id INT UNSIGNED,
    item_name VARCHAR(255) NOT NULL,
    contents TEXT NOT NULL,
    unit_price_pesewas INT NOT NULL CHECK (unit_price_pesewas > 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    CONSTRAINT fk_order_meal_bundles_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_meal_bundles_bundle FOREIGN KEY (meal_bundle_id) REFERENCES meal_bundles(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS order_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL,
    menu_item_id INT UNSIGNED NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    unit_price_pesewas INT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    bundle_component BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS order_feedback (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL UNIQUE,
    rating TINYINT UNSIGNED NOT NULL,
    comment_text TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_order_feedback_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT chk_order_feedback_rating CHECK (rating BETWEEN 1 AND 5)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    phone VARCHAR(40) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS customer_favorites (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    menu_item_id INT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_customer_favorite (user_id, menu_item_id),
    CONSTRAINT fk_customer_favorite_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_favorite_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS email_auth_tokens (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME(3) NOT NULL,
    used_at DATETIME(3),
    CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS restaurant_tables (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL UNIQUE,
    seats INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available'
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS bookings (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(120) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    booking_date VARCHAR(10) NOT NULL,
    booking_time VARCHAR(5) NOT NULL,
    party_size INT NOT NULL,
    notes VARCHAR(1000) NOT NULL DEFAULT '',
    table_id INT UNSIGNED,
    customer_user_id INT UNSIGNED,
    status VARCHAR(24) NOT NULL DEFAULT 'requested',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_bookings_table FOREIGN KEY (table_id) REFERENCES restaurant_tables(id),
    CONSTRAINT fk_bookings_user FOREIGN KEY (customer_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED,
    actor_name VARCHAR(120) NOT NULL,
    actor_email VARCHAR(254) NOT NULL,
    action VARCHAR(120) NOT NULL,
    entity VARCHAR(120) NOT NULL,
    entity_id VARCHAR(120),
    details TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS staff_announcements (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(32) NOT NULL,
    title VARCHAR(120) NOT NULL,
    body TEXT NOT NULL,
    author_id INT UNSIGNED,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT chk_staff_announcement_category CHECK (category IN ('employee_of_month', 'new_employee', 'promotion', 'general')),
    CONSTRAINT fk_staff_announcement_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS staff_announcement_reads (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    announcement_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_announcement_user_read (announcement_id, user_id),
    CONSTRAINT fk_announcement_reads_announcement FOREIGN KEY (announcement_id) REFERENCES staff_announcements(id) ON DELETE CASCADE,
    CONSTRAINT fk_announcement_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

  CREATE TABLE IF NOT EXISTS job_applications (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    desired_position VARCHAR(120) NOT NULL,
    message TEXT NOT NULL,
    resume_name VARCHAR(255) NOT NULL,
    resume_type VARCHAR(120) NOT NULL,
    resume_data LONGBLOB NOT NULL,
    consent_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`;

async function ensureColumn(pool, table, column, definition) {
  const [existing] = await pool.execute(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
  `, [table, column]);
  if (existing.length === 0) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

const connectionString = process.env.MYSQL_URL;
if (!connectionString) {
  throw new Error("MYSQL_URL is required. Set it to a MySQL 8-compatible connection string before starting OrderPulse.");
}

const databaseUrl = new URL(connectionString);
if (!["mysql:", "mysql2:"].includes(databaseUrl.protocol)) {
  throw new Error("MYSQL_URL must use the mysql:// or mysql2:// URL scheme.");
}
const sslCa = process.env.MYSQL_SSL_CA?.replace(/\\n/g, "\n");
const pool = mysql.createPool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port) || 3306,
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: decodeURIComponent(databaseUrl.pathname.replace(/^\//, "")),
  waitForConnections: true,
  connectionLimit: Number(process.env.DATABASE_POOL_SIZE) || 5,
  timezone: "Z",
  supportBigNumbers: true,
  bigNumberStrings: false,
  ...(process.env.MYSQL_SSL === "true" || databaseUrl.searchParams.get("ssl-mode")?.toUpperCase() === "REQUIRED"
    ? { ssl: { rejectUnauthorized: true, ...(sslCa ? { ca: sslCa } : {}) } }
    : {}),
});

await pool.query("SELECT 1");
for (const statement of schema.split(";").map((value) => value.trim()).filter(Boolean)) {
  await pool.query(statement);
}
await ensureColumn(pool, "users", "email_verified", "BOOLEAN NOT NULL DEFAULT TRUE");
await ensureColumn(pool, "orders", "payment_status", "VARCHAR(24) NOT NULL DEFAULT 'paid'");
await ensureColumn(pool, "orders", "payment_reference", "VARCHAR(120) NULL UNIQUE");
await ensureColumn(pool, "orders", "customer_user_id", "INT UNSIGNED NULL");
await ensureColumn(pool, "orders", "table_id", "INT UNSIGNED NULL");
await ensureColumn(pool, "orders", "delivery_address", "VARCHAR(500) NULL");
await ensureColumn(pool, "orders", "delivery_area", "VARCHAR(120) NULL");
await ensureColumn(pool, "orders", "delivery_fee_pesewas", "INT NOT NULL DEFAULT 0");
await ensureColumn(pool, "orders", "deal_code", "VARCHAR(40) NULL");
await ensureColumn(pool, "orders", "deal_discount_pesewas", "INT NOT NULL DEFAULT 0");
await ensureColumn(pool, "orders", "rewards_points_used", "INT NOT NULL DEFAULT 0");
await ensureColumn(pool, "orders", "rewards_discount_pesewas", "INT NOT NULL DEFAULT 0");
await ensureColumn(pool, "order_items", "bundle_component", "BOOLEAN NOT NULL DEFAULT FALSE");

export const db = createDatabaseAdapter(pool);
if (process.env.DB_SKIP_SEED !== "1") await seedDatabase(db);
