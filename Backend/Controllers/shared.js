import { db } from "../database/database.js";
import { reservationDurationMinutes } from "../services/reservation-availability.js";
import { beverageGroups, menuCategories } from "../schemas/menu-categories.js";

export { beverageGroups, menuCategories };

export const publicMenuItem = (item) => ({
  id: item.id,
  name: item.name,
  description: item.description,
  category: item.category,
  subcategory: item.subcategory,
  beverageGroup: item.beverage_group,
  price: item.price_pesewas / 100,
  imageUrl: item.image_url,
  badge: item.badge,
  available: Boolean(item.available) && (item.stock_quantity === null || item.stock_quantity > 0),
  referenceUrl: item.source_url,
});
export const staffMenuItem = (item) => ({
  ...publicMenuItem(item),
  listedAvailable: Boolean(item.available),
  stockQuantity: item.stock_quantity,
  lowStockThreshold: item.low_stock_threshold,
});

export const getMenuItems = () => db.all(`
  SELECT * FROM menu_items
  WHERE available = TRUE AND (stock_quantity IS NULL OR stock_quantity > 0)
  ORDER BY id
`);
export const validText = (value, min, max) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
export const validImageUrl = (value) => {
  if (typeof value !== "string" || value.length > 1000) return false;
  if (value.startsWith("/")) return !value.startsWith("//") && !value.split("/").includes("..");
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
export const cleanMenuItemName = (value) => value.trim().replace(/\s+/g, " ");
export const normalizeMenuItemName = (value) => typeof value === "string" ? cleanMenuItemName(value).toLowerCase() : "";
export const menuItemExists = async (name, excludeId = null) => {
  const query = excludeId === null
    ? "SELECT id FROM menu_items WHERE LOWER(name) = ?"
    : "SELECT id FROM menu_items WHERE LOWER(name) = ? AND id != ?";
  const params = excludeId === null ? [normalizeMenuItemName(name)] : [normalizeMenuItemName(name), excludeId];
  return db.get(query, params);
};
export const getMenuPlacementError = (category, beverageGroup, subcategory) => {
  if (!menuCategories.includes(category)) return "Choose a valid menu category.";
  if (!validText(subcategory, 2, 40)) return "Enter a valid dish or drink subsection.";
  if (category !== "Drinks" && beverageGroup) {
    return "This item is placed in the wrong menu category. Remove the drink category or move it to Drinks.";
  }
  if (category === "Drinks") {
    if (!beverageGroup || !beverageGroups.includes(beverageGroup)) {
      return "Choose a valid drink category for drinks in the menu.";
    }
    if (["Beer", "Wine", "Spirits & Liquors", "Cocktails"].includes(subcategory) && beverageGroup !== "Alcoholic Beverages") {
      return "Alcoholic menu items must be assigned to the Alcoholic Beverages group.";
    }
    if (["Hot Drinks", "Cold & Soft Drinks", "Juices & Smoothies"].includes(subcategory) && beverageGroup !== "Non-Alcoholic Beverages") {
      return "Non-alcoholic menu items must be assigned to the Non-Alcoholic Beverages group.";
    }
  }
  return "";
};
export const orderStatuses = ["received", "preparing", "ready", "completed", "cancelled"];
export const bookingStatuses = ["requested", "confirmed", "seated", "completed", "cancelled"];
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const jobPositionTitles = [
  "Dishwasher",
  "Dining Room Manager",
  "Pizza Cook",
  "Delivery Driver",
  "Host",
  "Dining Room Support",
  "Bartender",
  "Server",
  "Line Cook",
  "Greeter",
  "Food Runner",
];
export const minimumPasswordLength = 12;
export const maxMenuStock = 100000;
export const normalizedPhone = (phone) => phone.replace(/[^\d+]/g, "");
export const utcDayRange = (date) => [
  `${date}T00:00:00.000Z`,
  new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString(),
];
export const validBookingDate = (date) =>
  typeof date === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
  new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
export const validBookingTime = (time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export const validReservationHours = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  const startMinutes = hours * 60 + minutes;
  return startMinutes >= 11 * 60 && startMinutes + reservationDurationMinutes <= 22 * 60;
};
export const bookingStartsInFuture = (date, time) => Date.parse(`${date}T${time}:00Z`) >= Date.now();

export async function readOrders(database = db) {
  const orders = await database.all("SELECT * FROM orders ORDER BY created_at DESC, id DESC");
  return Promise.all(orders.map(async (order) => ({
    id: order.id,
    orderNumber: order.order_number,
    customerName: order.customer_name,
    phone: order.phone,
    orderType: order.order_type,
    total: order.total_pesewas / 100,
    status: order.status,
    paymentStatus: order.payment_status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: (await database.all("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", [order.id])).map((item) => ({
      name: item.item_name,
      quantity: item.quantity,
      unitPrice: item.unit_price_pesewas / 100,
    })),
  })));
}
