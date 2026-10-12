const fallbackImages = {
  local: [
    "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=85",
    "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=85",
    "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=900&q=85",
  ],
  foreign: [
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85",
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=85",
  ],
  drinks: [
    "https://images.unsplash.com/photo-1513558161293-c96b2eab9b2b?auto=format&fit=crop&w=900&q=85",
    "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=900&q=85",
    "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85",
  ],
  wine: [
    "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=85",
    "https://images.unsplash.com/photo-1516594798947-e65505dbb29d?auto=format&fit=crop&w=900&q=85",
  ],
};

const groups = [
  {
    category: "Local food",
    subcategory: "Kenkey",
    fallback: "local",
    items: [
      ["Ga kenkey with sardines & fried seafood", "https://pin.it/1BywIAWJK", "https://i.pinimg.com/736x/38/7b/2d/387b2d88896c199a6f99d6f193307742.jpg", 5800],
    ],
  },
  {
    category: "Local food",
    subcategory: "Abomu with plantains",
    fallback: "local",
    items: [
      ["Garden-egg abom with apem", "https://pin.it/CoWeGwGyh", "https://i.pinimg.com/736x/67/4b/e2/674be2423d6bf0aff16a97034f2320d8.jpg", 6200],
      ["Abomu & boiled plantain", "https://pin.it/4tK7ZGOpU", "https://i.pinimg.com/736x/e2/2f/11/e22f11c954bf504e763903137d896c7d.jpg", 5600],
      ["Ghanaian meat-free abomu plate", "https://pin.it/1buJ6IfOB", "https://i.pinimg.com/736x/0c/29/f9/0c29f9d071923a732e0d7d7a074acd93.jpg", 5200],
      ["Abomu with plantain & garden-egg stew", "https://pin.it/5pdyIATvO", "https://i.pinimg.com/736x/f3/f4/c1/f3f4c172640e5362e6d81b5b40bc9cc0.jpg", 5800],
    ],
  },
  {
    category: "Local food",
    subcategory: "Fufuo line",
    fallback: "local",
    items: [
      ["Home-cooked fufuo", "https://pin.it/7K3p1pShL", "https://i.pinimg.com/736x/ce/4a/ec/ce4aecb19d6268fed3721d8cb33c3d4c.jpg", 7200],
      ["Asanka fufuo with soup", "https://pin.it/2JtpNTN5u", "https://i.pinimg.com/736x/d6/27/01/d6270131f705baf419f6200fe150563b.jpg", 7400],
      ["Fufuo with garden-egg soup", "https://pin.it/6iQ4okWXI", "https://i.pinimg.com/736x/07/db/01/07db013e59bf4d0bfc55399ea4a8dbc2.jpg", 7600],
      ["Fufuo & chicken soup", "https://pin.it/64TaVeAeI", "https://i.pinimg.com/736x/63/a8/c9/63a8c9f4d11e910fc796f66e4efd34f6.jpg", 8200],
    ],
  },
  {
    category: "Local food",
    subcategory: "Red red",
    fallback: "local",
    items: [
      ["Red red & fried plantain", null, "/images/red-red.jpg", 6200, "Slow-cooked black-eyed peas in palm-oil stew with sweet, golden fried plantain."],
      ["Red red & crispy fries", "https://pin.it/2d0L9MZhW", "https://i.pinimg.com/736x/fe/1b/6a/fe1b6acce5cd850bebe8f9cf58028f4c.jpg", 5200],
      ["Ghanaian red red with plantain & avocado", "https://pin.it/2cMGLOozP", "https://i.pinimg.com/736x/19/8b/b9/198bb9d785e1d7fdfd4434a656b8e4ad.jpg", 6800],
    ],
  },
  {
    category: "Foreign food",
    subcategory: "International favourites",
    fallback: "foreign",
    items: [
      ["Crispy chicken tenders & fries", "https://pin.it/OqsXRGfNG", "https://i.pinimg.com/736x/df/c1/cb/dfc1cb310b40bc0c8d45c95ac82bb53c.jpg", 7600],
      ["Jamaican-style chicken fried rice", "https://pin.it/3T0gq8cEd", "https://i.pinimg.com/736x/15/be/22/15be226f6f8ceb9b1d25f2dfd202f3a4.jpg", 7200],
      ["Grilled chicken with garden salad", "https://pin.it/3vq4tJr1K", null, 7400],
      ["International chef's plate", "https://pin.it/64Qlaquuf", "https://i.pinimg.com/736x/01/f3/9c/01f39caa08fa08428ad3c4b8264113cd.jpg", 8200],
      ["Classic chicken & chips", "https://pin.it/692xGfc86", null, 6800],
    ],
  },
  {
    category: "Drinks",
    beverageGroup: "Non-Alcoholic Beverages",
    subcategory: "Juices & Smoothies",
    fallback: "drinks",
    items: [
      ["Fresh fruit cooler", "https://pin.it/5LPhJyjLg", null, 1800],
      ["House tropical juice", "https://pin.it/5MYgdDUOA", null, 2200],
      ["Iced watermelon cooler", "https://pin.it/1ciT8U2xC", "https://i.pinimg.com/736x/cf/ab/bf/cfabbfdd14102addc6cda5446f6b955b.jpg", 1800],
      ["Mango & passion fruit juice", "https://pin.it/3aVuHEtfx", null, 2400],
      ["Strawberry banana smoothie", "https://pin.it/3pFZ18cks", "https://i.pinimg.com/736x/4e/c4/8e/4ec48e33267c97cfdb5c0a631bb00831.jpg", 3200],
      ["Fresh lime & mint cooler", "https://pin.it/2GsZjh28L", null, 2000],
      ["Watermelon slushie", "https://pin.it/5x9t5PdjQ", "https://i.pinimg.com/736x/fc/66/20/fc6620a7346d1f7530bf80c276592c9b.jpg", 2400],
    ],
  },
  {
    category: "Drinks",
    beverageGroup: "Alcoholic Beverages",
    subcategory: "Wine",
    fallback: "wine",
    items: [
      ["Wine discovery selection", "https://pin.it/2QBFi9thy", null, 9200, "A curated glass from our wine list, selected to pair with your meal."],
      ["House red wine", null, null, 9000],
      ["House white wine", null, null, 9000],
      ["Rosé wine", null, null, 9500],
      ["Sparkling wine", null, null, 12000],
    ],
  },
];

let generatedIndex = 0;

const featuredMenu = groups.flatMap((group) =>
  group.items.map(([name, sourceUrl, pinnedImage, pricePesewas, customDescription], index) => {
    const imageUrl =
      pinnedImage ||
      (group.fallback === "wine"
        ? fallbackImages.wine[index % fallbackImages.wine.length]
        : fallbackImages[group.fallback][generatedIndex++ % fallbackImages[group.fallback].length]);
    const categoryLabel = group.category === "Local food" ? "Ghanaian" : group.category === "Foreign food" ? "international" : "fresh";
    return {
      name,
      description:
        customDescription ||
        (group.subcategory === "Wine"
          ? `A chilled glass of ${name.toLowerCase()}, selected to pair with your meal.`
          : `${categoryLabel[0].toUpperCase()}${categoryLabel.slice(1)} kitchen favourite, freshly prepared and served with care.`),
      category: group.category,
      beverageGroup: group.beverageGroup || null,
      pricePesewas,
      imageUrl,
      badge: null,
      subcategory: group.subcategory,
      sourceUrl,
      externalRef: sourceUrl || `house-menu:${group.subcategory}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    };
  }),
);

export default featuredMenu;
