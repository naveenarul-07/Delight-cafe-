const fs = require('fs');
const path = require('path');

function resolveMenuDir() {
  if (process.env.MENU_DIR) return path.resolve(process.env.MENU_DIR);

  const candidates = [
    path.join(process.cwd(), 'menu'),
    path.join(__dirname, '..', 'menu'),
    path.join(__dirname, 'menu'),
    path.join(__dirname, '..', '..', 'menu')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return path.join(process.cwd(), 'menu');
}

const MENU_DIR = resolveMenuDir();

const CATEGORY_LABELS = {
  'add-ons-and-extras': 'Add-ons & Extras',
  'burgers-and-sandwiches': 'Burgers & Sandwiches',
  'chefs-specials': "Chef's Specials",
  'coffee-and-tea': 'Coffee & Tea',
  'cold-beverages': 'Cold Beverages',
  'fresh-juices': 'Fresh Juices',
  'hot-beverages': 'Hot Beverages',
  'ice-creams': 'Ice Creams',
  'kids-menu': "Kids' Menu",
  'main-course': 'Main Course',
  'milkshakes-and-smoothies': 'Milkshakes & Smoothies',
  'pasta-and-noodles': 'Pasta & Noodles',
  'seasonal-specials': 'Seasonal Specials',
  'snacks-and-sides': 'Snacks & Sides',
  'wraps-and-rolls': 'Wraps & Rolls'
};

function formatCategoryLabel(slug) {
  if (CATEGORY_LABELS[slug]) return CATEGORY_LABELS[slug];
  return String(slug)
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function loadMenuFromFolder() {
  if (!fs.existsSync(MENU_DIR)) {
    console.warn('Menu folder not found:', MENU_DIR);
    return [];
  }

  const folders = fs
    .readdirSync(MENU_DIR)
    .filter((entry) => fs.statSync(path.join(MENU_DIR, entry)).isDirectory())
    .sort();

  const byName = new Map();
  const usedImages = new Set();

  for (const folder of folders) {
    const filePath = path.join(MENU_DIR, folder, 'items.json');
    if (!fs.existsSync(filePath)) continue;

    let items;
    try {
      items = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`Skipped invalid menu file: ${filePath}`, err.message);
      continue;
    }

    if (!Array.isArray(items)) continue;

    for (const raw of items) {
      const name = String(raw.name || '').trim();
      const image = String(raw.image || '').trim();
      const price = Number(raw.price);

      if (!name || !image || !Number.isFinite(price)) continue;
      if (byName.has(name) || usedImages.has(image)) continue;

      usedImages.add(image);
      byName.set(name, {
        name,
        image,
        price,
        category: folder,
        noPlatformFee: Boolean(raw.noPlatformFee)
      });
    }
  }

  return Array.from(byName.values());
}

function getAllMenuCategorySlugs() {
  if (!fs.existsSync(MENU_DIR)) return [];
  return fs
    .readdirSync(MENU_DIR)
    .filter((entry) => fs.statSync(path.join(MENU_DIR, entry)).isDirectory())
    .sort();
}

function getMenuCategories(items) {
  const counts = new Map();

  items.forEach((item) => {
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  });

  return getAllMenuCategorySlugs()
    .map((slug) => ({
      slug,
      label: formatCategoryLabel(slug),
      count: counts.get(slug) || 0
    }))
    .filter((cat) => cat.count > 0);
}

module.exports = {
  MENU_DIR,
  formatCategoryLabel,
  loadMenuFromFolder,
  getAllMenuCategorySlugs,
  getMenuCategories
};
