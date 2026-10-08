export const menuCategories = [
  "Local food",
  "Foreign food",
  "Appetizers or Starters",
  "Soups and Salads",
  "Main Courses or Entrées",
  "Side Dishes",
  "Desserts",
  "Sandwiches and Burgers",
  "Pasta and Noodles",
  "Kids Menu",
  "Drinks",
];

export const beverageGroups = [
  "Non-Alcoholic Beverages",
  "Alcoholic Beverages",
  "Functional & Specialty Beverages",
];

export const beverageSubcategories = [
  "Hot Drinks",
  "Cold & Soft Drinks",
  "Juices & Smoothies",
  "Beer",
  "Wine",
  "Spirits & Liquors",
  "Cocktails",
  "Mocktails & Zero-Proof",
];

export function isValidMenuPlacement(category, beverageGroup, subcategory) {
  if (!menuCategories.includes(category) || !subcategory?.trim()) return false;
  if (category !== "Drinks") return beverageGroup === null || beverageGroup === "";
  if (!beverageGroup || !beverageGroups.includes(beverageGroup)) return false;
  if (["Beer", "Wine", "Spirits & Liquors", "Cocktails"].includes(subcategory)) {
    return beverageGroup === "Alcoholic Beverages";
  }
  if (["Hot Drinks", "Cold & Soft Drinks", "Juices & Smoothies"].includes(subcategory)) {
    return beverageGroup === "Non-Alcoholic Beverages";
  }
  return true;
}
