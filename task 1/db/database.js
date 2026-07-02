/**
 * Database initialization and helper functions using sql.js (WASM-based SQLite).
 * 
 * sql.js loads SQLite compiled to WebAssembly, so initialization is async.
 * The database is persisted to disk as a file (ecommerce.db) and must be
 * explicitly saved after every write operation.
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Database file lives at the project root
const DB_PATH = path.join(__dirname, '..', 'ecommerce.db');

let db;

/**
 * Get (or initialize) the database instance.
 * On first call, loads the WASM engine, opens/creates the DB file,
 * enables foreign keys, and creates all tables if they don't exist.
 */
async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  try {
    // Try to load an existing database file
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } catch (e) {
    // No existing file — create a fresh in-memory database
    db = new SQL.Database();
  }

  // Enable foreign key enforcement (off by default in SQLite)
  db.run('PRAGMA foreign_keys = ON;');

  // ---------- Create tables if they don't exist ----------

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image TEXT,
      category TEXT,
      stock INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      reviews_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      shipping_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Persist the freshly-created schema to disk
  saveDb();

  return db;
}

/**
 * Write the current in-memory database out to the file system.
 * Must be called after every INSERT / UPDATE / DELETE.
 */
function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Execute a SELECT-style query and return all matching rows as objects.
 * @param {object} db   - sql.js Database instance
 * @param {string} sql  - SQL query string with ? placeholders
 * @param {Array}  params - Bind parameters (positional)
 * @returns {Array<object>}
 */
function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Execute a SELECT-style query and return only the first row (or null).
 */
function queryOne(db, sql, params = []) {
  const results = queryAll(db, sql, params);
  return results[0] || null;
}

/**
 * Execute a write statement (INSERT / UPDATE / DELETE) and persist to disk.
 */
function runSql(db, sql, params = []) {
  db.run(sql, params);
  saveDb();
}

module.exports = { getDb, saveDb, queryAll, queryOne, runSql };
