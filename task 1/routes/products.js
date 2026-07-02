/**
 * Product routes — browse the catalogue.
 *
 * GET /api/products        List all products (filterable by category and search)
 * GET /api/products/:id    Get a single product by ID
 */

const express = require('express');
const { getDb, queryAll, queryOne } = require('../db/database');

const router = express.Router();

// Helper: convert snake_case row to camelCase for frontend
function formatProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    image: row.image,
    category: row.category,
    stock: row.stock,
    rating: row.rating,
    reviewsCount: row.reviews_count,
    reviewCount: row.reviews_count // alias for frontend compatibility
  };
}

// ────────────────────────────────────────────────────────────────
// GET /api/products
// ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { category, search } = req.query;

    let sql = 'SELECT * FROM products';
    const conditions = [];
    const params = [];

    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    if (search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      const wildcard = `%${search}%`;
      params.push(wildcard, wildcard);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY id ASC';

    const products = queryAll(db, sql, params);
    return res.json({ success: true, data: products.map(formatProduct) });
  } catch (err) {
    console.error('Products list error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/products/:id
// ────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const product = queryOne(db, 'SELECT * FROM products WHERE id = ?', [Number(req.params.id)]);

    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }

    return res.json({ success: true, data: formatProduct(product) });
  } catch (err) {
    console.error('Product detail error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
