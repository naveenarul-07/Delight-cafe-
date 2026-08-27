const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { MENU_VERSION } = require('./menu-catalog');
const { loadMenuFromFolder, getMenuCategories } = require('./load-menu');

let pool = null;
let readyPromise = null;

function hasMysqlEnv() {
  return Boolean(
    process.env.DATABASE_URL ||
      process.env.MYSQL_URL ||
      (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE)
  );
}

function describeMysqlEnv() {
  return {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL || process.env.MYSQL_URL),
    hasHost: Boolean(process.env.MYSQL_HOST),
    hasUser: Boolean(process.env.MYSQL_USER),
    hasPassword: process.env.MYSQL_PASSWORD != null && process.env.MYSQL_PASSWORD !== '',
    hasDatabase: Boolean(process.env.MYSQL_DATABASE),
    hasSessionSecret: Boolean(process.env.SESSION_SECRET)
  };
}

function mysqlConfig() {
  if (!hasMysqlEnv()) {
    const err = new Error(
      'MySQL env vars missing on Netlify. Set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE (and SESSION_SECRET), then Redeploy.'
    );
    err.code = 'MYSQL_ENV_MISSING';
    throw err;
  }

  if (process.env.DATABASE_URL || process.env.MYSQL_URL) {
    return process.env.DATABASE_URL || process.env.MYSQL_URL;
  }

  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 5),
    namedPlaceholders: true,
    ssl: process.env.MYSQL_SSL === '0' ? undefined : { rejectUnauthorized: false }
  };
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool(mysqlConfig());
  }
  return pool;
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

function formatMysqlError(err) {
  const code = err?.code || '';
  if (code === 'MYSQL_ENV_MISSING') {
    return err.message;
  }
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return `Cannot reach MySQL host "${process.env.MYSQL_HOST || 'unknown'}". Check MYSQL_HOST / port and that the DB allows remote connections (not localhost-only).`;
  }
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return 'MySQL username/password rejected. Check MYSQL_USER and MYSQL_PASSWORD in Netlify env.';
  }
  if (code === 'ER_BAD_DB_ERROR') {
    return `MySQL database "${process.env.MYSQL_DATABASE}" does not exist. Create it, or fix MYSQL_DATABASE.`;
  }
  if (String(err?.message || '').includes('SSL')) {
    return 'MySQL SSL issue. Try setting MYSQL_SSL=0 in Netlify env, or enable SSL on your DB.';
  }
  return `Database connection failed: ${err?.message || 'unknown error'}`;
}

async function ensureDatabaseExists() {
  if (process.env.DATABASE_URL || process.env.MYSQL_URL) return;
  const database = process.env.MYSQL_DATABASE;
  if (!database) return;

  const adminPool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 1,
    ssl: process.env.MYSQL_SSL === '0' ? undefined : { rejectUnauthorized: false }
  });

  try {
    await adminPool.query(
      `CREATE DATABASE IF NOT EXISTS \`${String(database).replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await adminPool.end();
  }
}

async function initMysql() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    try {
      await ensureDatabaseExists();
    } catch (err) {
      // If user can't create DB, continue and let normal connect report the real error
      if (err?.code !== 'ER_DBACCESS_DENIED_ERROR' && err?.code !== 'ER_ACCESS_DENIED_ERROR') {
        console.warn('ensureDatabaseExists:', err.message);
      }
    }

    const p = getPool();
    // Probe connection early for clearer errors
    await p.query('SELECT 1');

    await p.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(191) NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'user',
        email VARCHAR(191) NULL,
        phone VARCHAR(32) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_users_username (username),
        UNIQUE KEY uniq_users_email (email),
        UNIQUE KEY uniq_users_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        image VARCHAR(512) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        category VARCHAR(191) NOT NULL DEFAULT 'general',
        available TINYINT NOT NULL DEFAULT 1,
        no_platform_fee TINYINT NOT NULL DEFAULT 0,
        UNIQUE KEY uniq_menu_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        username VARCHAR(191) NOT NULL,
        items_json LONGTEXT NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        coupon DECIMAL(10,2) NOT NULL DEFAULT 0,
        platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
        total DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(64) NULL,
        payment_meta LONGTEXT NULL,
        service_type VARCHAR(64) NULL,
        order_details_json LONGTEXT NULL,
        status VARCHAR(64) NOT NULL DEFAULT 'pending',
        invoice_token VARCHAR(128) NULL,
        placed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        updated_at TIMESTAMP NULL,
        INDEX idx_orders_user (user_id),
        INDEX idx_orders_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS app_meta (
        meta_key VARCHAR(191) PRIMARY KEY,
        meta_value TEXT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(191) NOT NULL,
        email VARCHAR(191) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_carts (
        user_id INT PRIMARY KEY,
        cart_json LONGTEXT NOT NULL,
        order_details_json LONGTEXT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR(191) PRIMARY KEY,
        sess LONGTEXT NOT NULL,
        expired BIGINT NOT NULL,
        INDEX idx_sessions_expired (expired)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await seedUsers();
    await syncMenuCatalog();
  })().catch((err) => {
    readyPromise = null;
    pool = null;
    throw err;
  });

  return readyPromise;
}

async function seedUsers() {
  const rows = await query('SELECT COUNT(*) AS c FROM users');
  if (Number(rows[0].c) > 0) return;
  await query('INSERT INTO users (username, password, role, email, phone) VALUES (?, ?, ?, ?, ?)', [
    'admin',
    'admin123',
    'admin',
    null,
    null
  ]);
  await query('INSERT INTO users (username, password, role, email, phone) VALUES (?, ?, ?, ?, ?)', [
    'user',
    'password',
    'user',
    null,
    null
  ]);
}

async function syncMenuCatalog() {
  const rows = await query('SELECT meta_value FROM app_meta WHERE meta_key = ?', ['menu_version']);
  const storedVersion = rows[0] ? Number(rows[0].meta_value) : 0;
  if (storedVersion === MENU_VERSION) return;

  await query('DELETE FROM menu_items');
  const items = loadMenuFromFolder();
  for (const item of items) {
    await query(
      `INSERT INTO menu_items (name, image, price, category, no_platform_fee, available)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [item.name, item.image, item.price, item.category, item.noPlatformFee ? 1 : 0]
    );
  }
  await query(
    `INSERT INTO app_meta (meta_key, meta_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
    ['menu_version', String(MENU_VERSION)]
  );
}

function normalizeAuthEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeAuthPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  const phone = digits.length > 10 ? digits.slice(-10) : digits;
  if (!/^[6-9]\d{9}$/.test(phone)) return null;
  return phone;
}

function normalizeAuthIdentifier(raw) {
  const value = String(raw || '').trim();
  if (!value) return { kind: 'invalid', value: '' };
  if (value.includes('@')) {
    const email = normalizeAuthEmail(value);
    if (email === null) return { kind: 'invalid_email', value: '' };
    return { kind: 'email', value: email };
  }
  if (/[\d+]/.test(value) && value.replace(/\D/g, '').length >= 10) {
    const phone = normalizeAuthPhone(value);
    if (phone === null) return { kind: 'invalid_phone', value: '' };
    return { kind: 'phone', value: phone };
  }
  return { kind: 'username', value: value.toLowerCase() };
}

async function findUserByCredentials(identifier, password) {
  const p = String(password || '').trim().toLowerCase();
  if (!p) return null;
  const parsed = normalizeAuthIdentifier(identifier);
  let rows = [];

  if (parsed.kind === 'email') {
    rows = await query(
      `SELECT id, username, password, role, email, phone FROM users
       WHERE LOWER(COALESCE(email, '')) = ? OR LOWER(username) = ? LIMIT 1`,
      [parsed.value, parsed.value]
    );
  } else if (parsed.kind === 'phone') {
    rows = await query(
      `SELECT id, username, password, role, email, phone FROM users
       WHERE phone = ? OR username = ? LIMIT 1`,
      [parsed.value, parsed.value]
    );
  } else if (parsed.kind === 'username') {
    rows = await query(
      `SELECT id, username, password, role, email, phone FROM users
       WHERE LOWER(username) = ? LIMIT 1`,
      [parsed.value]
    );
  } else {
    return null;
  }

  const user = rows[0];
  if (!user || String(user.password || '').toLowerCase() !== p) return null;
  return user;
}

async function findUserByUsername(username) {
  const rows = await query(
    `SELECT id, username, role, email, phone FROM users WHERE LOWER(username) = ? LIMIT 1`,
    [String(username || '').trim().toLowerCase()]
  );
  return rows[0] || null;
}

async function findUserByEmail(email) {
  const e = normalizeAuthEmail(email);
  if (!e) return null;
  const rows = await query(
    `SELECT id, username, role, email, phone FROM users
     WHERE LOWER(COALESCE(email, '')) = ? OR LOWER(username) = ? LIMIT 1`,
    [e, e]
  );
  return rows[0] || null;
}

async function findUserByPhone(phone) {
  const p = normalizeAuthPhone(phone);
  if (!p) return null;
  const rows = await query(
    `SELECT id, username, role, email, phone FROM users
     WHERE phone = ? OR username = ? LIMIT 1`,
    [p, p]
  );
  return rows[0] || null;
}

async function createUser(username, password, { email = null, phone = null, role = 'user' } = {}) {
  const result = await query(
    `INSERT INTO users (username, password, role, email, phone) VALUES (?, ?, ?, ?, ?)`,
    [username, password, role, email || null, phone || null]
  );
  return {
    id: result.insertId,
    username,
    role,
    email: email || null,
    phone: phone || null
  };
}

async function getMenuItems() {
  const rows = await query(
    `SELECT id, name, image, price, category, no_platform_fee AS noPlatformFee
     FROM menu_items WHERE available = 1 ORDER BY category, name`
  );
  return rows.map((item) => ({
    ...item,
    price: Number(item.price),
    noPlatformFee: Boolean(item.noPlatformFee)
  }));
}

async function getMenuItemByName(name) {
  const rows = await query(
    `SELECT name, price, no_platform_fee AS noPlatformFee
     FROM menu_items WHERE name = ? AND available = 1 LIMIT 1`,
    [name]
  );
  if (!rows[0]) return null;
  return { ...rows[0], price: Number(rows[0].price), noPlatformFee: Boolean(rows[0].noPlatformFee) };
}

async function getUserCart(userId) {
  const rows = await query(`SELECT cart_json, order_details_json FROM user_carts WHERE user_id = ? LIMIT 1`, [
    userId
  ]);
  if (!rows[0]) return { cart: [], orderDetails: null };
  try {
    return {
      cart: JSON.parse(rows[0].cart_json || '[]'),
      orderDetails: rows[0].order_details_json ? JSON.parse(rows[0].order_details_json) : null
    };
  } catch {
    return { cart: [], orderDetails: null };
  }
}

async function saveUserCart(userId, cart, orderDetails) {
  await query(
    `INSERT INTO user_carts (user_id, cart_json, order_details_json)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE cart_json = VALUES(cart_json), order_details_json = VALUES(order_details_json)`,
    [userId, JSON.stringify(cart || []), orderDetails ? JSON.stringify(orderDetails) : null]
  );
}

async function clearUserCart(userId) {
  await query(`DELETE FROM user_carts WHERE user_id = ?`, [userId]);
}

async function getSession(sid) {
  await query(`DELETE FROM sessions WHERE expired < ?`, [Date.now()]);
  const rows = await query(`SELECT sess FROM sessions WHERE sid = ? AND expired >= ? LIMIT 1`, [
    sid,
    Date.now()
  ]);
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].sess);
  } catch {
    return null;
  }
}

async function setSession(sid, sess, maxAgeMs) {
  const expired = Date.now() + (maxAgeMs || 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE sess = VALUES(sess), expired = VALUES(expired)`,
    [sid, JSON.stringify(sess), expired]
  );
}

async function destroySession(sid) {
  await query(`DELETE FROM sessions WHERE sid = ?`, [sid]);
}

async function touchSession(sid, maxAgeMs) {
  const expired = Date.now() + (maxAgeMs || 24 * 60 * 60 * 1000);
  await query(`UPDATE sessions SET expired = ? WHERE sid = ?`, [expired, sid]);
}

async function cleanupExpiredSessions() {
  await query(`DELETE FROM sessions WHERE expired < ?`, [Date.now()]);
}

async function createContactMessage({ name, email, message }) {
  const result = await query(`INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)`, [
    name,
    email,
    message
  ]);
  return { id: result.insertId, name, email, message };
}

async function recordUserLogin(user, { identifier = '', ip = '', userAgent = '' } = {}) {
  if (!user?.id) return null;
  await query(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      username VARCHAR(191) NOT NULL,
      identifier VARCHAR(191) NULL,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      logged_in_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_login_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  const result = await query(
    `INSERT INTO login_history (user_id, username, identifier, ip, user_agent) VALUES (?, ?, ?, ?, ?)`,
    [
      user.id,
      user.username,
      String(identifier || '').slice(0, 191),
      String(ip || '').slice(0, 64),
      String(userAgent || '').slice(0, 255)
    ]
  );
  return { id: result.insertId, userId: user.id };
}

async function createOrder({
  userId,
  username,
  items,
  subtotal,
  coupon,
  platformFee,
  total,
  paymentMethod,
  paymentMeta,
  serviceType,
  orderDetails,
  status = 'pending'
}) {
  const result = await query(
    `INSERT INTO orders
      (user_id, username, items_json, subtotal, coupon, platform_fee, total, payment_method, payment_meta, service_type, order_details_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId || null,
      username,
      JSON.stringify(items || []),
      subtotal,
      coupon || 0,
      platformFee || 0,
      total,
      paymentMethod || null,
      paymentMeta ? JSON.stringify(paymentMeta) : null,
      serviceType || null,
      orderDetails ? JSON.stringify(orderDetails) : null,
      status
    ]
  );
  return getOrderById(result.insertId);
}

async function getOrderById(id) {
  const rows = await query(`SELECT * FROM orders WHERE id = ? LIMIT 1`, [id]);
  if (!rows[0]) return null;
  return mapOrderRow(rows[0]);
}

async function getOrdersByUserId(userId, options = {}) {
  const status = String(options.status || '').trim().toLowerCase();
  const rows = await query(`SELECT * FROM orders WHERE user_id = ? ORDER BY placed_at DESC`, [userId]);
  const mapped = rows.map(mapOrderRow);
  if (!status || status === 'all') return mapped;
  const active = new Set(['pending', 'confirmed', 'preparing', 'out_for_delivery', 'paid']);
  if (status === 'active') return mapped.filter((o) => active.has(String(o.status)));
  if (status === 'completed') return mapped.filter((o) => String(o.status) === 'delivered');
  if (status === 'cancelled') return mapped.filter((o) => String(o.status) === 'cancelled');
  return mapped.filter((o) => String(o.status) === status);
}

const ACTIVE_ORDER_HOURS = 24;
const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'out_for_delivery', 'paid']);

function isActiveOrder(order, hours = ACTIVE_ORDER_HOURS) {
  if (!order?.placedAt) return ACTIVE_STATUSES.has(String(order?.status || ''));
  const ageMs = Date.now() - new Date(order.placedAt).getTime();
  return ageMs <= hours * 60 * 60 * 1000 && ACTIVE_STATUSES.has(String(order.status || ''));
}

async function getAllOrders() {
  const rows = await query(`SELECT * FROM orders ORDER BY placed_at DESC`);
  return rows.map(mapOrderRow);
}

async function getActiveOrders(hours = ACTIVE_ORDER_HOURS) {
  const all = await getAllOrders();
  return all.filter((o) => isActiveOrder(o, hours));
}

async function getOrdersArchiveByDate(hours = ACTIVE_ORDER_HOURS) {
  const all = await getAllOrders();
  const archived = all.filter((o) => !isActiveOrder(o, hours));
  const byDate = {};
  for (const order of archived) {
    const key = String(order.placedAt || '').slice(0, 10) || 'unknown';
    if (!byDate[key]) byDate[key] = { date: key, label: key, orders: [] };
    byDate[key].orders.push(order);
  }
  return Object.values(byDate).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function ensureInvoiceToken(orderId) {
  const order = await getOrderById(orderId);
  if (!order) return null;
  if (order.invoiceToken) return order;
  const token = `inv_${orderId}_${require('crypto').randomBytes(12).toString('hex')}`;
  await query(`UPDATE orders SET invoice_token = ? WHERE id = ?`, [token, orderId]);
  return getOrderById(orderId);
}

async function updateOrderStatus(orderId, status) {
  const allowed = new Set([
    'pending',
    'confirmed',
    'preparing',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'paid'
  ]);
  if (!allowed.has(String(status || ''))) return null;
  const existing = await getOrderById(orderId);
  if (!existing) return null;
  const completedAt = status === 'delivered' || status === 'cancelled' ? new Date() : null;
  await query(
    `UPDATE orders SET status = ?, completed_at = COALESCE(?, completed_at), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, completedAt, orderId]
  );
  return getOrderById(orderId);
}

async function getAllUsers() {
  const rows = await query(
    `SELECT id, username, role, email, phone, created_at AS createdAt FROM users ORDER BY id ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    email: row.email || null,
    phone: row.phone || null,
    createdAt: row.createdAt
  }));
}

async function getAdminStats() {
  const orderRows = await query(`
    SELECT
      COUNT(*) AS totalOrders,
      COALESCE(SUM(total), 0) AS totalRevenue,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'confirmed', 'preparing') THEN 1 ELSE 0 END), 0) AS activeOrders
    FROM orders
  `);
  const userRows = await query(`SELECT COUNT(*) AS c FROM users`);
  const menuRows = await query(`SELECT COUNT(*) AS c FROM menu_items WHERE available = 1`);
  const totals = orderRows[0] || {};
  return {
    totalOrders: Number(totals.totalOrders || 0),
    totalRevenue: Number(totals.totalRevenue || 0),
    activeOrders: Number(totals.activeOrders || 0),
    totalUsers: Number(userRows[0]?.c || 0),
    menuItems: Number(menuRows[0]?.c || 0)
  };
}

async function getAllContactMessages() {
  const rows = await query(`SELECT * FROM contact_messages ORDER BY created_at DESC`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    createdAt: row.created_at
  }));
}

async function getCustomerDetailsForAdmin({ activeOnly = true } = {}) {
  const orders = activeOnly ? await getActiveOrders() : await getAllOrders();
  return orders.map((order) => ({
    orderId: order.id,
    username: order.username,
    fullName: order.orderDetails?.fullName || order.username,
    phone: order.orderDetails?.phone || order.orderDetails?.mobile || '',
    serviceType: order.serviceType,
    items: order.items,
    total: order.total,
    paymentMethod: order.paymentMethod,
    status: order.status,
    placedAt: order.placedAt
  }));
}

async function ensureCustomerMessagesTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS customer_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NULL,
      phone VARCHAR(32) NULL,
      message TEXT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      channel VARCHAR(32) NULL,
      send_method VARCHAR(64) NULL,
      last_error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TIMESTAMP NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function mapCustomerMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    phone: row.phone,
    message: row.message,
    status: row.status,
    channel: row.channel,
    sendMethod: row.send_method,
    lastError: row.last_error,
    createdAt: row.created_at,
    sentAt: row.sent_at
  };
}

async function createCustomerMessage({
  orderId = null,
  phone = '',
  message = '',
  status = 'pending',
  channel = 'whatsapp',
  sendMethod = null,
  lastError = null
} = {}) {
  await ensureCustomerMessagesTable();
  const result = await query(
    `INSERT INTO customer_messages (order_id, phone, message, status, channel, send_method, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderId, phone || null, message, status, channel, sendMethod, lastError]
  );
  const rows = await query(`SELECT * FROM customer_messages WHERE id = ? LIMIT 1`, [result.insertId]);
  return mapCustomerMessageRow(rows[0]);
}

async function getCustomerMessagesByCategory(search = '') {
  await ensureCustomerMessagesTable();
  const rows = await query(`SELECT * FROM customer_messages ORDER BY created_at DESC`);
  let all = rows.map(mapCustomerMessageRow);
  const q = String(search || '').trim().toLowerCase();
  if (q) {
    all = all.filter(
      (m) =>
        String(m.phone || '').toLowerCase().includes(q) ||
        String(m.message || '').toLowerCase().includes(q) ||
        String(m.orderId || '').includes(q)
    );
  }
  const sent = all.filter((m) => m.status === 'sent');
  const pending = all.filter((m) => m.status === 'pending' || m.status === 'ready');
  const failed = all.filter((m) => m.status === 'failed');
  return {
    all,
    sent,
    pending,
    failed,
    counts: { all: all.length, sent: sent.length, pending: pending.length, failed: failed.length }
  };
}

async function markCustomerMessageSent(id, channelOrOpts = 'whatsapp') {
  await ensureCustomerMessagesTable();
  const opts =
    typeof channelOrOpts === 'string' ? { channel: channelOrOpts } : channelOrOpts || {};
  await query(
    `UPDATE customer_messages
     SET status = 'sent', channel = ?, send_method = COALESCE(?, send_method), sent_at = CURRENT_TIMESTAMP, last_error = NULL
     WHERE id = ?`,
    [opts.channel || 'whatsapp', opts.sendMethod || null, id]
  );
  const rows = await query(`SELECT * FROM customer_messages WHERE id = ? LIMIT 1`, [id]);
  return mapCustomerMessageRow(rows[0]);
}

async function markCustomerMessageFailed(id, channelOrOpts = 'whatsapp') {
  await ensureCustomerMessagesTable();
  const opts =
    typeof channelOrOpts === 'string' ? { channel: channelOrOpts } : channelOrOpts || {};
  await query(
    `UPDATE customer_messages
     SET status = 'failed', channel = ?, send_method = COALESCE(?, send_method), last_error = ?
     WHERE id = ?`,
    [opts.channel || 'whatsapp', opts.sendMethod || null, opts.lastError || 'Send failed', id]
  );
  const rows = await query(`SELECT * FROM customer_messages WHERE id = ? LIMIT 1`, [id]);
  return mapCustomerMessageRow(rows[0]);
}

async function getSmsSettings() {
  return {
    provider: 'whatsapp',
    configured: true,
    easyMode: true,
    channel: 'whatsapp'
  };
}

async function saveSmsSettings() {
  return getSmsSettings();
}

function mapOrderRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    items: JSON.parse(row.items_json || '[]'),
    subtotal: Number(row.subtotal),
    coupon: Number(row.coupon),
    platformFee: Number(row.platform_fee),
    total: Number(row.total),
    paymentMethod: row.payment_method,
    paymentMeta: row.payment_meta ? JSON.parse(row.payment_meta) : {},
    serviceType: row.service_type || 'dining',
    orderDetails: row.order_details_json ? JSON.parse(row.order_details_json) : {},
    status: row.status,
    placedAt: row.placed_at,
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at || row.placed_at || null,
    invoiceToken: row.invoice_token || null
  };
}

module.exports = {
  hasMysqlEnv,
  describeMysqlEnv,
  formatMysqlError,
  initMysql,
  getPool,
  normalizeAuthEmail,
  normalizeAuthPhone,
  normalizeAuthIdentifier,
  findUserByCredentials,
  findUserByUsername,
  findUserByEmail,
  findUserByPhone,
  createUser,
  getMenuItems,
  getMenuItemByName,
  getMenuCategories,
  getUserCart,
  saveUserCart,
  clearUserCart,
  getSession,
  setSession,
  destroySession,
  touchSession,
  cleanupExpiredSessions,
  createContactMessage,
  recordUserLogin,
  createOrder,
  getOrderById,
  getOrdersByUserId,
  ensureInvoiceToken,
  getAllUsers,
  getAllOrders,
  getActiveOrders,
  getOrdersArchiveByDate,
  updateOrderStatus,
  getAdminStats,
  getAllContactMessages,
  getCustomerDetailsForAdmin,
  getCustomerMessagesByCategory,
  markCustomerMessageSent,
  markCustomerMessageFailed,
  createCustomerMessage,
  getSmsSettings,
  saveSmsSettings
};
