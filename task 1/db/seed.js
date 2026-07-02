/**
 * Seed script — populates the products table with 12 sample products
 * across 4 categories. Safe to call multiple times: it skips seeding
 * if products already exist.
 *
 * Can be run standalone:  node db/seed.js
 * Also called from server.js on startup.
 */

const { getDb, saveDb, queryOne, runSql } = require('./database');

// ── Product catalogue (12 items, 4 categories) — Prices in INR ──────
const PRODUCTS = [
  // Electronics
  {
    name: 'Wireless Noise-Cancelling Headphones',
    description: 'Premium over-ear headphones with active noise cancellation, 30-hour battery life, and Hi-Res audio support.',
    price: 20999, image: 'electronics1.jpg', category: 'Electronics',
    stock: 45, rating: 4.7, reviews_count: 1284
  },
  {
    name: 'Ultra-Slim 4K Monitor',
    description: '27-inch IPS display with 4K UHD resolution, HDR10 support, and USB-C connectivity for seamless productivity.',
    price: 37499, image: 'electronics2.jpg', category: 'Electronics',
    stock: 23, rating: 4.5, reviews_count: 856
  },
  {
    name: 'Smart Fitness Watch Pro',
    description: 'Advanced health tracking with ECG, SpO2, GPS, and 14-day battery life. Water resistant to 50m.',
    price: 16999, image: 'electronics3.jpg', category: 'Electronics',
    stock: 67, rating: 4.6, reviews_count: 2341
  },

  // Clothing
  {
    name: 'Premium Merino Wool Sweater',
    description: 'Luxuriously soft 100% merino wool crewneck sweater. Temperature regulating and naturally odor resistant.',
    price: 7499, image: 'clothing1.jpg', category: 'Clothing',
    stock: 120, rating: 4.4, reviews_count: 567
  },
  {
    name: 'Tailored Fit Chino Pants',
    description: 'Classic chino pants with modern tailored fit. Wrinkle-resistant fabric with stretch comfort.',
    price: 4999, image: 'clothing2.jpg', category: 'Clothing',
    stock: 85, rating: 4.3, reviews_count: 423
  },
  {
    name: 'Waterproof Adventure Jacket',
    description: 'All-weather protection with breathable 3-layer fabric. Sealed seams and adjustable hood.',
    price: 14999, image: 'clothing3.jpg', category: 'Clothing',
    stock: 34, rating: 4.8, reviews_count: 912
  },

  // Home & Kitchen
  {
    name: 'Artisan Coffee Maker',
    description: 'Pour-over style automatic coffee maker with built-in grinder, thermal carafe, and programmable brewing.',
    price: 13499, image: 'home1.jpg', category: 'Home & Kitchen',
    stock: 52, rating: 4.6, reviews_count: 1567
  },
  {
    name: 'Smart LED Floor Lamp',
    description: 'Minimalist arc floor lamp with Wi-Fi control, 16M colors, adjustable brightness, and voice assistant support.',
    price: 10999, image: 'home2.jpg', category: 'Home & Kitchen',
    stock: 38, rating: 4.4, reviews_count: 743
  },
  {
    name: 'Luxury Bedding Set',
    description: '1000-thread count Egyptian cotton sheet set with duvet cover. Silky soft and breathable.',
    price: 18499, image: 'home3.jpg', category: 'Home & Kitchen',
    stock: 29, rating: 4.7, reviews_count: 1891
  },

  // Books
  {
    name: 'The Art of Clean Code',
    description: 'A comprehensive guide to writing maintainable, elegant code. Covers design patterns, refactoring, and best practices.',
    price: 2899, image: 'books1.jpg', category: 'Books',
    stock: 200, rating: 4.8, reviews_count: 3456
  },
  {
    name: 'Mindful Leadership',
    description: 'Discover how mindfulness practices can transform your leadership style and organizational culture.',
    price: 1999, image: 'books2.jpg', category: 'Books',
    stock: 150, rating: 4.5, reviews_count: 892
  },
  {
    name: 'The Cosmic Frontier',
    description: 'An illustrated journey through the latest discoveries in astrophysics, from black holes to dark matter.',
    price: 3499, image: 'books3.jpg', category: 'Books',
    stock: 95, rating: 4.9, reviews_count: 2178
  }
];

/**
 * Insert all seed products if the table is currently empty.
 */
async function seed() {
  const db = await getDb();

  // Check whether products already exist
  const existing = queryOne(db, 'SELECT COUNT(*) AS count FROM products');
  if (existing && existing.count > 0) {
    console.log(`✓ Seeding skipped — ${existing.count} products already in database.`);
    return;
  }

  const insertSql = `
    INSERT INTO products (name, description, price, image, category, stock, rating, reviews_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const p of PRODUCTS) {
    db.run(insertSql, [
      p.name, p.description, p.price, p.image,
      p.category, p.stock, p.rating, p.reviews_count
    ]);
  }

  // Persist all inserts in one go
  saveDb();
  console.log(`✓ Seeded ${PRODUCTS.length} products into the database.`);
}

module.exports = seed;

// ── Allow running directly: node db/seed.js ─────────────────────────────
if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}
