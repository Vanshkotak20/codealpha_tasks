/**
 * Cart routes — works for both guest users (session_id) and
 * authenticated users (user_id).
 *
 * GET    /api/cart       — list cart items with product details
 * POST   /api/cart       — add a product to the cart
 * PUT    /api/cart/:id   — update item quantity
 * DELETE /api/cart/:id   — remove item from cart
 */

const express = require('express');
const { getDb, queryAll, queryOne, runSql, saveDb } = require('../db/database');

const router = express.Router();

// ── Helper: build the owner filter based on session state ────────
function cartOwnerFilter(req) {
  if (req.session && req.session.userId) {
    return { clause: 'user_id = ?', param: req.session.userId };
  }
  return { clause: 'session_id = ?', param: req.sessionID };
}

// ── Helper: format cart items for frontend (flat structure) ──────
function formatCartItems(items) {
  return items.map(item => ({
    id: item.id,
    productId: item.product_id,
    quantity: item.quantity,
    name: item.name,
    price: item.price,
    image: item.image,
    category: item.category || '',
    stock: item.stock,
    subtotal: Math.round(item.price * item.quantity * 100) / 100
  }));
}

// ────────────────────────────────────────────────────────────────
// GET /api/cart
// Returns a FLAT ARRAY of cart items (not an object)
// ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { clause, param } = cartOwnerFilter(req);

    const items = queryAll(
      db,
      `SELECT
         ci.id,
         ci.product_id,
         ci.quantity,
         p.name,
         p.price,
         p.image,
         p.stock,
         p.category
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ${clause}
       ORDER BY ci.id ASC`,
      [param]
    );

    return res.json({
      success: true,
      data: formatCartItems(items)
    });
  } catch (err) {
    console.error('Cart list error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /api/cart
// Body: { productId, quantity? }  (quantity defaults to 1)
// ────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const db = await getDb();
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: 'productId is required.' });
    }

    if (quantity < 1) {
      return res.status(400).json({ success: false, error: 'Quantity must be at least 1.' });
    }

    // Check product exists and has stock
    const product = queryOne(db, 'SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ success: false, error: 'Product not found.' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ success: false, error: `Only ${product.stock} items in stock.` });
    }

    const { clause, param } = cartOwnerFilter(req);

    // Check if the product is already in this cart
    const existingItem = queryOne(
      db,
      `SELECT id, quantity FROM cart_items WHERE ${clause} AND product_id = ?`,
      [param, productId]
    );

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (newQty > product.stock) {
        return res.status(400).json({
          success: false,
          error: `Cannot add more. Only ${product.stock} items in stock.`
        });
      }
      runSql(db, 'UPDATE cart_items SET quantity = ? WHERE id = ?', [newQty, existingItem.id]);
    } else {
      // Insert new cart item
      if (req.session && req.session.userId) {
        runSql(
          db,
          'INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)',
          [req.session.userId, productId, quantity]
        );
      } else {
        runSql(
          db,
          'INSERT INTO cart_items (session_id, product_id, quantity) VALUES (?, ?, ?)',
          [req.sessionID, productId, quantity]
        );
      }
    }

    // Return the updated cart (flat array)
    const items = queryAll(
      db,
      `SELECT
         ci.id, ci.product_id, ci.quantity,
         p.name, p.price, p.image, p.stock, p.category
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ${clause}
       ORDER BY ci.id ASC`,
      [param]
    );

    return res.status(201).json({
      success: true,
      data: formatCartItems(items)
    });
  } catch (err) {
    console.error('Cart add error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// PUT /api/cart/:id
// Body: { quantity }
// ────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const cartItemId = Number(req.params.id);
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, error: 'Quantity must be at least 1.' });
    }

    // Verify the cart item exists and belongs to this user/session
    const { clause, param } = cartOwnerFilter(req);
    const item = queryOne(
      db,
      `SELECT ci.id, ci.product_id FROM cart_items ci WHERE ci.id = ? AND ${clause}`,
      [cartItemId, param]
    );

    if (!item) {
      return res.status(404).json({ success: false, error: 'Cart item not found.' });
    }

    // Check stock
    const product = queryOne(db, 'SELECT stock FROM products WHERE id = ?', [item.product_id]);
    if (quantity > product.stock) {
      return res.status(400).json({
        success: false,
        error: `Only ${product.stock} items in stock.`
      });
    }

    runSql(db, 'UPDATE cart_items SET quantity = ? WHERE id = ?', [quantity, cartItemId]);

    return res.json({ success: true, data: { message: 'Cart item updated.' } });
  } catch (err) {
    console.error('Cart update error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// DELETE /api/cart/:id
// ────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const cartItemId = Number(req.params.id);
    const { clause, param } = cartOwnerFilter(req);

    // Verify ownership
    const item = queryOne(
      db,
      `SELECT id FROM cart_items WHERE id = ? AND ${clause}`,
      [cartItemId, param]
    );

    if (!item) {
      return res.status(404).json({ success: false, error: 'Cart item not found.' });
    }

    runSql(db, 'DELETE FROM cart_items WHERE id = ?', [cartItemId]);

    return res.json({ success: true, data: { message: 'Cart item removed.' } });
  } catch (err) {
    console.error('Cart delete error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
