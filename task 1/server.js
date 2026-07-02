/**
 * server.js — E-commerce API entry point.
 *
 * Starts Express, configures middleware (JSON parsing, sessions,
 * static files), mounts all API routers, initialises the database,
 * seeds sample products, and listens on the configured port.
 */

const express = require('express');
const path = require('path');
const session = require('express-session');
const { getDb } = require('./db/database');
const seed = require('./db/seed');

const app = express();

// ── Body parsers ────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files (CSS, images, client JS, etc.) ─────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Session configuration ───────────────────────────────────────
app.use(
  session({
    secret: 'ecommerce-secret-key-2024',
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// ── API routes ──────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));

// ── Async startup ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    // Initialise database (creates tables if needed)
    await getDb();
    console.log('✓ Database initialised.');

    // Seed sample products on first run
    await seed();

    // Start listening
    app.listen(PORT, () => {
      console.log(`✓ E-commerce API running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
