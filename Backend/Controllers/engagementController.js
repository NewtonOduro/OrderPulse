import { db } from "../database/database.js";
import { readLoyaltyBalance } from "../services/loyalty.js";
import { emailPattern, publicMenuItem, validText } from "./shared.js";

const rewardThreshold = 100;
const rewardPesewas = 500;

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function activeAt(now = new Date()) {
  return now.toISOString();
}

function readDeal(deal) {
  return {
    id: deal.id,
    title: deal.title,
    description: deal.description,
    code: deal.code,
    discount: deal.discount_pesewas / 100,
    active: Boolean(deal.active),
    startsAt: deal.starts_at,
    endsAt: deal.ends_at,
  };
}

async function readMealBundle(database, bundle) {
  const items = await database.all(`
    SELECT m.id, m.name, bi.quantity, m.available, m.stock_quantity
    FROM meal_bundle_items bi
    JOIN menu_items m ON m.id = bi.menu_item_id
    WHERE bi.bundle_id = ?
    ORDER BY m.name
  `, [bundle.id]);
  return {
    id: bundle.id,
    title: bundle.title,
    description: bundle.description,
    price: bundle.price_pesewas / 100,
    active: Boolean(bundle.active),
    startsAt: bundle.starts_at,
    endsAt: bundle.ends_at,
    items: items.map(({ id, name, quantity }) => ({ id, name, quantity })),
    availableForSale: !items.some((item) =>
      !item.available || (item.stock_quantity !== null && item.stock_quantity < item.quantity),
    ),
  };
}

async function listMealBundles(database, activeOnly = false) {
  const now = activeAt();
  const where = activeOnly
    ? "WHERE active = TRUE AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?)"
    : "";
  const params = activeOnly ? [now, now] : [];
  const bundles = await database.all(`
    SELECT id, title, description, price_pesewas, active, starts_at, ends_at
    FROM meal_bundles ${where}
    ORDER BY created_at DESC, id DESC
  `, params);
  const result = await Promise.all(bundles.map((bundle) => readMealBundle(database, bundle)));
  return activeOnly ? result.filter((bundle) => bundle.availableForSale) : result;
}

export const restaurantOptions = async (_request, response) => {
  const now = activeAt();
  const [areas, deals, bundles, tables] = await Promise.all([
    db.all("SELECT id, area_name, fee_pesewas FROM delivery_areas WHERE enabled = TRUE ORDER BY area_name"),
    db.all(`
      SELECT id, title, description, code, discount_pesewas, active, starts_at, ends_at
      FROM restaurant_deals
      WHERE active = TRUE AND (starts_at IS NULL OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at > ?)
      ORDER BY created_at DESC, id DESC
    `, [now, now]),
    listMealBundles(db, true),
    db.all("SELECT id, name FROM restaurant_tables ORDER BY id"),
  ]);
  return response.json({
    deliveryAreas: areas.map((area) => ({
      id: area.id,
      name: area.area_name,
      fee: area.fee_pesewas / 100,
    })),
    deals: deals.map(readDeal),
    bundles,
    tables: tables.map((table) => ({ id: table.id, name: table.name })),
  });
};

async function linkVerifiedCustomerOrders(user) {
  if (!emailPattern.test(user.email)) return;
  await db.run(`
    UPDATE orders SET customer_user_id = ?
    WHERE customer_user_id IS NULL AND LOWER(customer_email) = LOWER(?) AND payment_status = 'paid'
  `, [user.id, user.email]);
}

export const customerEngagement = async (request, response) => {
  await linkVerifiedCustomerOrders(request.user);
  const [points, favorites, recentOrders] = await Promise.all([
    readLoyaltyBalance(db, request.user.id),
    db.get("SELECT COUNT(*) AS count FROM customer_favorites WHERE user_id = ?", [request.user.id]),
    db.all(`
      SELECT id, order_number, order_type, total_pesewas, status, payment_status, created_at
      FROM orders WHERE customer_user_id = ? ORDER BY created_at DESC, id DESC LIMIT 5
    `, [request.user.id]),
  ]);
  const balance = Math.max(0, points.earned - points.reserved);
  return response.json({
    points: balance,
    pointsToNextReward: Math.max(0, rewardThreshold - (balance % rewardThreshold)),
    rewardDiscount: rewardPesewas / 100,
    favoriteCount: Number(favorites.count),
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.order_number,
      orderType: order.order_type,
      total: order.total_pesewas / 100,
      status: order.status,
      paymentStatus: order.payment_status,
      createdAt: order.created_at,
    })),
  });
};

export const customerFavorites = async (request, response) => {
  const favorites = await db.all(`
    SELECT m.*, f.created_at AS favorited_at
    FROM customer_favorites f
    JOIN menu_items m ON m.id = f.menu_item_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC, f.id DESC
  `, [request.user.id]);
  return response.json(favorites.map((item) => ({
    ...publicMenuItem(item),
    favoritedAt: item.favorited_at,
  })));
};

export const addCustomerFavorite = async (request, response) => {
  const menuItemId = validId(request.params.menuItemId);
  if (!menuItemId) return response.status(400).json({ error: "Choose a valid menu item." });
  const item = await db.get("SELECT id FROM menu_items WHERE id = ?", [menuItemId]);
  if (!item) return response.status(404).json({ error: "Menu item not found." });
  try {
    await db.run("INSERT INTO customer_favorites (user_id, menu_item_id) VALUES (?, ?)", [
      request.user.id,
      menuItemId,
    ]);
  } catch (error) {
    if (!["23505", "ER_DUP_ENTRY"].includes(error.code)) throw error;
  }
  return response.status(204).end();
};

export const removeCustomerFavorite = async (request, response) => {
  const menuItemId = validId(request.params.menuItemId);
  if (!menuItemId) return response.status(400).json({ error: "Choose a valid menu item." });
  await db.run("DELETE FROM customer_favorites WHERE user_id = ? AND menu_item_id = ?", [
    request.user.id,
    menuItemId,
  ]);
  return response.status(204).end();
};

export const customerOrderHistory = async (request, response) => {
  await linkVerifiedCustomerOrders(request.user);
  const orders = await db.all(`
    SELECT id, order_number, order_type, total_pesewas, status, payment_status, created_at
    FROM orders WHERE customer_user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30
  `, [request.user.id]);
  return response.json(await Promise.all(orders.map(async (order) => ({
    id: order.id,
    orderNumber: order.order_number,
    orderType: order.order_type,
    total: order.total_pesewas / 100,
    status: order.status,
    paymentStatus: order.payment_status,
    createdAt: order.created_at,
    items: [
      ...(await db.all(`
        SELECT menu_item_id, item_name, quantity
        FROM order_items WHERE order_id = ? AND bundle_component = FALSE ORDER BY id
      `, [order.id])).map((item) => ({
        menuItemId: item.menu_item_id,
        name: item.item_name,
        quantity: item.quantity,
      })),
      ...(await db.all(`
        SELECT meal_bundle_id, item_name, contents, quantity
        FROM order_meal_bundles WHERE order_id = ? ORDER BY id
      `, [order.id])).map((bundle) => ({
        bundleId: bundle.meal_bundle_id,
        name: bundle.item_name,
        quantity: bundle.quantity,
        contents: bundle.contents,
      })),
    ],
  }))));
};

export const managerDeliveryAreas = async (_request, response) => {
  const areas = await db.all("SELECT id, area_name, fee_pesewas, enabled FROM delivery_areas ORDER BY area_name");
  return response.json(areas.map((area) => ({
    id: area.id,
    name: area.area_name,
    fee: area.fee_pesewas / 100,
    enabled: Boolean(area.enabled),
  })));
};

export const createDeliveryArea = async (request, response) => {
  const { name, fee } = request.body ?? {};
  if (!validText(name, 2, 120) || !Number.isFinite(fee) || fee < 0 || fee > 10000) {
    return response.status(400).json({ error: "Enter a delivery area and a fee between GH₵0 and GH₵10,000." });
  }
  try {
    const result = await db.run(`
      INSERT INTO delivery_areas (area_name, fee_pesewas, enabled) VALUES (?, ?, TRUE)
    `, [name.trim(), Math.round(fee * 100)]);
    const area = await db.get("SELECT id, area_name, fee_pesewas, enabled FROM delivery_areas WHERE id = ?", [result.lastInsertRowid]);
    return response.status(201).json({
      id: area.id,
      name: area.area_name,
      fee: area.fee_pesewas / 100,
      enabled: Boolean(area.enabled),
    });
  } catch (error) {
    if (["23505", "ER_DUP_ENTRY"].includes(error.code)) {
      return response.status(409).json({ error: "That delivery area already exists." });
    }
    throw error;
  }
};

export const updateDeliveryArea = async (request, response) => {
  const id = validId(request.params.id);
  const { fee, enabled } = request.body ?? {};
  if (!id || !Number.isFinite(fee) || fee < 0 || fee > 10000 || typeof enabled !== "boolean") {
    return response.status(400).json({ error: "Choose a valid delivery fee and whether the area is enabled." });
  }
  const result = await db.run("UPDATE delivery_areas SET fee_pesewas = ?, enabled = ? WHERE id = ?", [
    Math.round(fee * 100),
    enabled,
    id,
  ]);
  if (result.changes === 0) return response.status(404).json({ error: "Delivery area not found." });
  const area = await db.get("SELECT id, area_name, fee_pesewas, enabled FROM delivery_areas WHERE id = ?", [id]);
  return response.json({
    id: area.id,
    name: area.area_name,
    fee: area.fee_pesewas / 100,
    enabled: Boolean(area.enabled),
  });
};

export const managerDeals = async (_request, response) => {
  const deals = await db.all(`
    SELECT id, title, description, code, discount_pesewas, active, starts_at, ends_at
    FROM restaurant_deals ORDER BY created_at DESC, id DESC
  `);
  return response.json(deals.map(readDeal));
};

export const createDeal = async (request, response) => {
  const { title, description, code, discount, startsAt = null, endsAt = null } = request.body ?? {};
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (
    !validText(title, 2, 120) ||
    !validText(description, 3, 500) ||
    !/^[A-Z0-9_-]{3,40}$/.test(normalizedCode) ||
    !Number.isFinite(discount) ||
    discount <= 0 ||
    discount > 100000 ||
    (startsAt && (!start || Number.isNaN(start.getTime()))) ||
    (endsAt && (!end || Number.isNaN(end.getTime()))) ||
    (start && end && end <= start)
  ) {
    return response.status(400).json({ error: "Check the deal title, description, code, discount and optional active dates." });
  }
  try {
    const result = await db.run(`
      INSERT INTO restaurant_deals (title, description, code, discount_pesewas, starts_at, ends_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      title.trim(),
      description.trim(),
      normalizedCode,
      Math.round(discount * 100),
      start?.toISOString() || null,
      end?.toISOString() || null,
    ]);
    const deal = await db.get(`
      SELECT id, title, description, code, discount_pesewas, active, starts_at, ends_at
      FROM restaurant_deals WHERE id = ?
    `, [result.lastInsertRowid]);
    return response.status(201).json(readDeal(deal));
  } catch (error) {
    if (["23505", "ER_DUP_ENTRY"].includes(error.code)) {
      return response.status(409).json({ error: "That deal code is already in use." });
    }
    throw error;
  }
};

export const updateDealStatus = async (request, response) => {
  const id = validId(request.params.id);
  const { active } = request.body ?? {};
  if (!id || typeof active !== "boolean") {
    return response.status(400).json({ error: "Choose whether the deal is active." });
  }
  const result = await db.run("UPDATE restaurant_deals SET active = ? WHERE id = ?", [active, id]);
  if (result.changes === 0) return response.status(404).json({ error: "Deal not found." });
  const deal = await db.get(`
    SELECT id, title, description, code, discount_pesewas, active, starts_at, ends_at
    FROM restaurant_deals WHERE id = ?
  `, [id]);
  return response.json(readDeal(deal));
};

export const managerMealBundles = async (_request, response) => {
  return response.json(await listMealBundles(db));
};

export const createMealBundle = async (request, response) => {
  const { title, description, price, items, startsAt = null, endsAt = null } = request.body ?? {};
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (
    !validText(title, 2, 120) ||
    !validText(description, 3, 500) ||
    !Number.isFinite(price) ||
    price < 0.01 ||
    price > 100000 ||
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 20 ||
    items.some((item) =>
      !Number.isSafeInteger(item?.id) ||
      item.id < 1 ||
      !Number.isInteger(item?.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20,
    ) ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    (startsAt && (!start || Number.isNaN(start.getTime()))) ||
    (endsAt && (!end || Number.isNaN(end.getTime()))) ||
    (start && end && end <= start)
  ) {
    return response.status(400).json({ error: "Check the bundle title, description, price, included menu items and optional active dates." });
  }
  const includedItems = await db.all(
    `SELECT id FROM menu_items
     WHERE id IN (${items.map(() => "?").join(", ")})
       AND available = TRUE AND (stock_quantity IS NULL OR stock_quantity > 0)`,
    items.map((item) => item.id),
  );
  if (includedItems.length !== items.length) {
    return response.status(400).json({ error: "One or more selected menu items no longer exist." });
  }
  const result = await db.transaction(async (transaction) => {
    const bundleResult = await transaction.run(`
      INSERT INTO meal_bundles (title, description, price_pesewas, starts_at, ends_at)
      VALUES (?, ?, ?, ?, ?)
    `, [
      title.trim(),
      description.trim(),
      Math.round(price * 100),
      start?.toISOString() || null,
      end?.toISOString() || null,
    ]);
    for (const item of items) {
      await transaction.run(
        "INSERT INTO meal_bundle_items (bundle_id, menu_item_id, quantity) VALUES (?, ?, ?)",
        [bundleResult.lastInsertRowid, item.id, item.quantity],
      );
    }
    return transaction.get(`
      SELECT id, title, description, price_pesewas, active, starts_at, ends_at
      FROM meal_bundles WHERE id = ?
    `, [bundleResult.lastInsertRowid]);
  });
  return response.status(201).json(await readMealBundle(db, result));
};

export const updateMealBundleStatus = async (request, response) => {
  const id = validId(request.params.id);
  const { active } = request.body ?? {};
  if (!id || typeof active !== "boolean") {
    return response.status(400).json({ error: "Choose whether the meal bundle is active." });
  }
  const result = await db.run("UPDATE meal_bundles SET active = ? WHERE id = ?", [active, id]);
  if (result.changes === 0) return response.status(404).json({ error: "Meal bundle not found." });
  const bundle = await db.get(`
    SELECT id, title, description, price_pesewas, active, starts_at, ends_at
    FROM meal_bundles WHERE id = ?
  `, [id]);
  return response.json(await readMealBundle(db, bundle));
};
