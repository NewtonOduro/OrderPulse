import featuredMenu from "./featured-menu.js";

export async function seedDatabase(db) {
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
    try {
      await db.run(`
        INSERT INTO menu_items (
          name, description, category, price_pesewas, image_url, badge, subcategory, source_url, external_ref, beverage_group
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    } catch (error) {
      if (!["23505", "ER_DUP_ENTRY"].includes(error.code)) throw error;
    }
  }

  const tableCount = await db.get("SELECT COUNT(*) AS count FROM restaurant_tables");
  if (Number(tableCount.count) === 0) {
    for (const [name, seats] of [["Table 1", 2], ["Table 2", 2], ["Table 3", 4], ["Table 4", 4], ["Table 5", 6], ["Table 6", 8]]) {
      await db.run("INSERT INTO restaurant_tables (name, seats) VALUES (?, ?)", [name, seats]);
    }
  }
}
