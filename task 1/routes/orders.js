/**
 * Order routes — all require authentication.
 *
 * POST /api/orders       — place an order from the current cart
 * GET  /api/orders       — list the logged-in user's orders
 * GET  /api/orders/:id   — get full order details (with items)
 */

const express = require('express');
const { getDb, queryAll, queryOne, runSql, saveDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All order routes require a logged-in user
router.use(requireAuth);

// Helper: format order for frontend (camelCase)
function formatOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    total: row.total,
    status: row.status,
    shippingAddress: row.shipping_address,
    createdAt: row.created_at,
    itemCount: row.item_count || 0
  };
}

// Helper: format order item for frontend
function formatOrderItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    name: row.name,
    price: row.price,
    quantity: row.quantity
  };
}

// ────────────────────────────────────────────────────────────────
// POST /api/orders
// Body: { shippingAddress }
// ────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.session.userId;
    const { shippingAddress } = req.body;

    if (!shippingAddress) {
      return res.status(400).json({
        success: false,
        error: 'Shipping address is required.'
      });
    }

    // Fetch all cart items for this user (with product details)
    const cartItems = queryAll(
      db,
      `SELECT ci.id, ci.product_id, ci.quantity,
              p.name, p.price, p.stock
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       WHERE ci.user_id = ?`,
      [userId]
    );

    if (cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Your cart is empty.'
      });
    }

    // Validate stock for every item before committing
    for (const item of cartItems) {
      if (item.quantity > item.stock) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for "${item.name}". Only ${item.stock} left.`
        });
      }
    }

    // Calculate total
    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const roundedTotal = Math.round(total * 100) / 100;

    // Create the order
    db.run(
      'INSERT INTO orders (user_id, total, status, shipping_address) VALUES (?, ?, ?, ?)',
      [userId, roundedTotal, 'pending', shippingAddress]
    );

    // Get the new order's id (last inserted rowid)
    const orderRow = queryOne(db, 'SELECT last_insert_rowid() AS id');
    const orderId = orderRow.id;

    // Create order_items (snapshot) and decrease stock
    for (const item of cartItems) {
      db.run(
        `INSERT INTO order_items (order_id, product_id, name, price, quantity)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.name, item.price, item.quantity]
      );

      db.run(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
    }

    // Clear the user's cart
    db.run('DELETE FROM cart_items WHERE user_id = ?', [userId]);

    // Persist everything at once
    saveDb();

    // Return the created order with its items
    const order = queryOne(db, 'SELECT * FROM orders WHERE id = ?', [orderId]);
    const orderItems = queryAll(db, 'SELECT * FROM order_items WHERE order_id = ?', [orderId]);

    return res.status(201).json({
      success: true,
      data: {
        ...formatOrder(order),
        items: orderItems.map(formatOrderItem)
      }
    });
  } catch (err) {
    console.error('Place order error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/orders
// ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.session.userId;

    const orders = queryAll(
      db,
      `SELECT o.*,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [userId]
    );

    return res.json({ success: true, data: orders.map(formatOrder) });
  } catch (err) {
    console.error('List orders error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/orders/:id
// ────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.session.userId;
    const orderId = Number(req.params.id);

    const order = queryOne(
      db,
      'SELECT * FROM orders WHERE id = ? AND user_id = ?',
      [orderId, userId]
    );

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found.' });
    }

    const items = queryAll(
      db,
      'SELECT * FROM order_items WHERE order_id = ?',
      [orderId]
    );

    return res.json({
      success: true,
      data: {
        ...formatOrder(order),
        items: items.map(formatOrderItem)
      }
    });
  } catch (err) {
    console.error('Order detail error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
