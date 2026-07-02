/**
 * Auth routes — registration, login, logout, and session check.
 *
 * On login the guest cart (identified by session_id) is migrated to the
 * authenticated user so items aren't lost when switching from anonymous
 * browsing to a logged-in session.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, queryOne, queryAll, runSql, saveDb } = require('../db/database');

const router = express.Router();

// ────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // --- Validation ---
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and password are required.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters.'
      });
    }

    const db = await getDb();

    // Check for duplicate email
    const existing = queryOne(db, 'SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.'
      });
    }

    // Hash password and insert user
    const hashedPassword = await bcrypt.hash(password, 10);
    runSql(
      db,
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );

    // Retrieve the newly created user (to get the auto-generated id)
    const user = queryOne(db, 'SELECT id, name, email, created_at FROM users WHERE email = ?', [email]);

    // Set session
    req.session.userId = user.id;

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const db = await getDb();

    const user = queryOne(db, 'SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // ── Migrate guest cart to user account ──
    const sessionId = req.sessionID;
    const guestItems = queryAll(
      db,
      'SELECT id, product_id, quantity FROM cart_items WHERE session_id = ?',
      [sessionId]
    );

    for (const guestItem of guestItems) {
      // Check if the user already has this product in their cart
      const existingUserItem = queryOne(
        db,
        'SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?',
        [user.id, guestItem.product_id]
      );

      if (existingUserItem) {
        // Merge quantities
        db.run(
          'UPDATE cart_items SET quantity = ? WHERE id = ?',
          [existingUserItem.quantity + guestItem.quantity, existingUserItem.id]
        );
        db.run('DELETE FROM cart_items WHERE id = ?', [guestItem.id]);
      } else {
        // Re-assign the guest row to the logged-in user
        db.run(
          'UPDATE cart_items SET user_id = ?, session_id = NULL WHERE id = ?',
          [user.id, guestItem.id]
        );
      }
    }
    saveDb();

    // Set session
    req.session.userId = user.id;

    // Return user without password
    const { password: _pw, ...safeUser } = user;
    return res.json({ success: true, data: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ────────────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Failed to log out.' });
      }
      return res.json({ success: true, data: { message: 'Logged out successfully.' } });
    });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.json({ success: true, data: null });
    }

    const db = await getDb();
    const user = queryOne(
      db,
      'SELECT id, name, email, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );

    return res.json({ success: true, data: user || null });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
