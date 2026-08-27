const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { MENU_VERSION, DEFAULT_MENU } = require('./menu-catalog');

// On Render you can set DATABASE_PATH to a persistent disk path (e.g. /var/data/castle-cafe.db)
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'castle-cafe.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      image TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      available INTEGER NOT NULL DEFAULT 1,
      no_platform_fee INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      coupon REAL NOT NULL DEFAULT 0,
      platform_fee REAL NOT NULL DEFAULT 5,
      total REAL NOT NULL,
      payment_method TEXT,
      payment_meta TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      placed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      channel TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS user_carts (
      user_id INTEGER PRIMARY KEY,
      cart_json TEXT NOT NULL DEFAULT '[]',
      order_details_json TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );
  `);

  seedUsers();
  ensureLoginHistoryTable();
  migrateMenuSchema();
  migrateOrderSchema();
  migrateCustomerMessagesSchema();
  migrateUsersSchema();
  syncMenuCatalog();
  migrateLegacyUsers();
}

function migrateUsersSchema() {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const names = columns.map((col) => col.name);

  if (!names.includes('email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
  }
  if (!names.includes('phone')) {
    db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
      ON users(email) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone
      ON users(phone) WHERE phone IS NOT NULL;
  `);
}

function migrateCustomerMessagesSchema() {
  const columns = db.prepare('PRAGMA table_info(customer_messages)').all();
  const names = new Set(columns.map((col) => col.name));

  const add = (name, sqlType) => {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE customer_messages ADD COLUMN ${name} ${sqlType}`);
    }
  };

  // SQLite ALTER TABLE only allows constant defaults (no datetime('now'))
  add('customer_name', 'TEXT');
  add('bill_total', 'REAL');
  add('media_type', "TEXT DEFAULT 'png'");
  add('receipt_code', 'TEXT');
  add('send_method', 'TEXT');
  add('attempt_count', 'INTEGER DEFAULT 0');
  add('last_error', 'TEXT');
  add('sent_at', 'TEXT');
  add('updated_at', 'TEXT');
}

function migrateOrderSchema() {
  const columns = db.prepare('PRAGMA table_info(orders)').all();
  const names = columns.map((col) => col.name);

  if (!names.includes('service_type')) {
    db.exec("ALTER TABLE orders ADD COLUMN service_type TEXT NOT NULL DEFAULT 'dining'");
  }

  if (!names.includes('order_details_json')) {
    db.exec("ALTER TABLE orders ADD COLUMN order_details_json TEXT NOT NULL DEFAULT '{}'");
  }

  if (!names.includes('invoice_token')) {
    db.exec('ALTER TABLE orders ADD COLUMN invoice_token TEXT');
  }

  if (!names.includes('completed_at')) {
    db.exec('ALTER TABLE orders ADD COLUMN completed_at TEXT');
  }

  if (!names.includes('updated_at')) {
    db.exec('ALTER TABLE orders ADD COLUMN updated_at TEXT');
    db.exec("UPDATE orders SET updated_at = placed_at WHERE updated_at IS NULL");
  }
}

function migrateMenuSchema() {
  const columns = db.prepare('PRAGMA table_info(menu_items)').all();
  const hasNoFee = columns.some((col) => col.name === 'no_platform_fee');
  if (!hasNoFee) {
    db.exec('ALTER TABLE menu_items ADD COLUMN no_platform_fee INTEGER NOT NULL DEFAULT 0');
  }
}

function seedUsers() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const insert = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
  insert.run('admin', 'admin123', 'admin');
  insert.run('user', 'password', 'user');
}

function ensureLoginHistoryTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      identifier TEXT,
      ip TEXT,
      user_agent TEXT,
      logged_in_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

function recordUserLogin(user, { identifier = '', ip = '', userAgent = '' } = {}) {
  ensureLoginHistoryTable();
  if (!user?.id) return null;
  const result = db
    .prepare(
      `INSERT INTO login_history (user_id, username, identifier, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      user.id,
      user.username,
      String(identifier || '').slice(0, 191),
      String(ip || '').slice(0, 64),
      String(userAgent || '').slice(0, 255)
    );
  return { id: result.lastInsertRowid, userId: user.id };
}

function migrateLegacyUsers() {
  const legacyPath = path.join(__dirname, '..', 'users.json');
  if (!fs.existsSync(legacyPath)) return;

  try {
    const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    if (!Array.isArray(legacy)) return;

    const insert = db.prepare(
      'INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)'
    );

    legacy.forEach((user) => {
      const role = String(user.username).toLowerCase() === 'admin' ? 'admin' : 'user';
      insert.run(user.username, user.password, role);
    });
  } catch (err) {
    console.error('Legacy user migration skipped:', err.message);
  }
}

function syncMenuCatalog() {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get('menu_version');
  const storedVersion = row ? Number(row.value) : 0;

  if (storedVersion === MENU_VERSION) return;

  db.prepare('DELETE FROM menu_items').run();

  const insert = db.prepare(
    'INSERT INTO menu_items (name, image, price, category, no_platform_fee) VALUES (?, ?, ?, ?, ?)'
  );

  DEFAULT_MENU.forEach((item) => {
    insert.run(item.name, item.image, item.price, item.category, item.noPlatformFee ? 1 : 0);
  });

  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
    'menu_version',
    String(MENU_VERSION)
  );

  console.log(`Menu catalog synced: ${DEFAULT_MENU.length} items from menu/ folder (v${MENU_VERSION})`);
}

function normalizeAuthEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function normalizeAuthPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length > 10) digits = digits.slice(-10);
  if (!/^\d{10}$/.test(digits)) return null;
  return digits;
}

function normalizeAuthIdentifier(raw) {
  const value = String(raw || '').trim();
  if (!value) return { kind: 'empty', value: '' };

  if (value.includes('@')) {
    const email = normalizeAuthEmail(value);
    if (email === null) return { kind: 'invalid_email', value: '' };
    return { kind: 'email', value: email };
  }

  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly.length >= 10) {
    const phone = normalizeAuthPhone(value);
    if (phone === null) return { kind: 'invalid_phone', value: '' };
    return { kind: 'phone', value: phone };
  }

  return { kind: 'username', value: value.toLowerCase() };
}

function findUserByCredentials(identifier, password) {
  const p = String(password || '').trim().toLowerCase();
  if (!p) return null;

  const parsed = normalizeAuthIdentifier(identifier);
  let user = null;

  if (parsed.kind === 'email') {
    user = db
      .prepare(
        `SELECT id, username, password, role, email, phone FROM users
         WHERE lower(COALESCE(email, '')) = ? OR lower(username) = ?`
      )
      .get(parsed.value, parsed.value);
  } else if (parsed.kind === 'phone') {
    user = db
      .prepare(
        `SELECT id, username, password, role, email, phone FROM users
         WHERE phone = ? OR username = ?`
      )
      .get(parsed.value, parsed.value);
  } else if (parsed.kind === 'username') {
    user = db
      .prepare(
        `SELECT id, username, password, role, email, phone FROM users
         WHERE username = ? COLLATE NOCASE`
      )
      .get(parsed.value);
  }

  if (!user || String(user.password || '').toLowerCase() !== p) return null;
  return user;
}

function findUserByUsername(username) {
  const u = String(username || '').trim();
  return db
    .prepare('SELECT id, username, role, email, phone FROM users WHERE username = ? COLLATE NOCASE')
    .get(u);
}

function findUserByEmail(email) {
  const e = normalizeAuthEmail(email);
  if (!e) return null;
  return db
    .prepare(
      `SELECT id, username, role, email, phone FROM users
       WHERE lower(COALESCE(email, '')) = ? OR lower(username) = ?`
    )
    .get(e, e);
}

function findUserByPhone(phone) {
  const p = normalizeAuthPhone(phone);
  if (!p) return null;
  return db
    .prepare(
      `SELECT id, username, role, email, phone FROM users
       WHERE phone = ? OR username = ?`
    )
    .get(p, p);
}

function createUser(username, password, { email = null, phone = null, role = 'user' } = {}) {
  const result = db
    .prepare(
      `INSERT INTO users (username, password, role, email, phone)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(username, password, role, email || null, phone || null);
  return {
    id: result.lastInsertRowid,
    username,
    role,
    email: email || null,
    phone: phone || null
  };
}

function getAllUsers() {
  return db
    .prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC')
    .all();
}

function getMenuItems() {
  return db
    .prepare(
      `SELECT id, name, image, price, category, no_platform_fee AS noPlatformFee
       FROM menu_items WHERE available = 1 ORDER BY category, name`
    )
    .all()
    .map((item) => ({
      ...item,
      noPlatformFee: Boolean(item.noPlatformFee)
    }));
}

function getMenuItemByName(name) {
  const row = db
    .prepare(
      `SELECT name, price, no_platform_fee AS noPlatformFee
       FROM menu_items WHERE name = ? AND available = 1`
    )
    .get(name);

  if (!row) return null;
  return { ...row, noPlatformFee: Boolean(row.noPlatformFee) };
}

function mapOrderRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    items: JSON.parse(row.items_json),
    subtotal: row.subtotal,
    coupon: row.coupon,
    platformFee: row.platform_fee,
    total: row.total,
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

function createOrder({
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
  status
}) {
  const initialStatus = status || (paymentMethod === 'cod' ? 'confirmed' : 'paid');

  const result = db
    .prepare(`
      INSERT INTO orders (
        user_id, username, items_json, subtotal, coupon, platform_fee, total,
        payment_method, payment_meta, service_type, order_details_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      userId,
      username,
      JSON.stringify(items),
      subtotal,
      coupon,
      platformFee,
      total,
      paymentMethod || 'card',
      JSON.stringify(paymentMeta || {}),
      serviceType || 'dining',
      JSON.stringify(orderDetails || {}),
      initialStatus
    );

  return getOrderById(result.lastInsertRowid);
}

function getOrderById(id) {
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  return row ? mapOrderRow(row) : null;
}

function getOrderByInvoiceToken(token) {
  const clean = String(token || '').trim();
  if (!clean) return null;
  const row = db.prepare('SELECT * FROM orders WHERE invoice_token = ?').get(clean);
  return row ? mapOrderRow(row) : null;
}

function ensureInvoiceToken(orderId) {
  const order = getOrderById(orderId);
  if (!order) return null;
  if (order.invoiceToken) return order;

  const token = `inv_${orderId}_${require('crypto').randomBytes(12).toString('hex')}`;
  db.prepare('UPDATE orders SET invoice_token = ? WHERE id = ?').run(token, orderId);
  return getOrderById(orderId);
}

function getOrdersByUserId(userId, options = {}) {
  const status = String(options.status || '').trim().toLowerCase();
  const rows = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY placed_at DESC')
    .all(userId)
    .map(mapOrderRow);

  if (!status || status === 'all') return rows;

  const active = new Set(['pending', 'confirmed', 'preparing', 'out_for_delivery', 'paid']);
  if (status === 'active') return rows.filter((o) => active.has(String(o.status)));
  if (status === 'completed') return rows.filter((o) => String(o.status) === 'delivered');
  if (status === 'cancelled') return rows.filter((o) => String(o.status) === 'cancelled');
  return rows.filter((o) => String(o.status) === status);
}

function getUserCart(userId) {
  const row = db.prepare('SELECT cart_json, order_details_json FROM user_carts WHERE user_id = ?').get(userId);
  if (!row) return { cart: [], orderDetails: null };
  let cart = [];
  let orderDetails = null;
  try {
    cart = JSON.parse(row.cart_json || '[]');
  } catch (_) {
    cart = [];
  }
  try {
    orderDetails = row.order_details_json ? JSON.parse(row.order_details_json) : null;
  } catch (_) {
    orderDetails = null;
  }
  return {
    cart: Array.isArray(cart) ? cart : [],
    orderDetails
  };
}

function saveUserCart(userId, cart, orderDetails) {
  if (!userId) return;
  const detailsJson =
    orderDetails === undefined
      ? undefined
      : orderDetails
        ? JSON.stringify(orderDetails)
        : null;

  const existing = db.prepare('SELECT user_id, order_details_json FROM user_carts WHERE user_id = ?').get(userId);
  if (existing) {
    if (detailsJson === undefined) {
      db.prepare(
        `UPDATE user_carts
         SET cart_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      ).run(JSON.stringify(cart || []), userId);
    } else {
      db.prepare(
        `UPDATE user_carts
         SET cart_json = ?, order_details_json = ?, updated_at = datetime('now')
         WHERE user_id = ?`
      ).run(JSON.stringify(cart || []), detailsJson, userId);
    }
    return;
  }

  db.prepare(
    `INSERT INTO user_carts (user_id, cart_json, order_details_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(userId, JSON.stringify(cart || []), detailsJson === undefined ? null : detailsJson);
}

function clearUserCart(userId) {
  if (!userId) return;
  db.prepare(
    `UPDATE user_carts
     SET cart_json = '[]', order_details_json = NULL, updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(userId);
}

function getSession(sid) {
  const row = db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid);
  if (!row) return null;
  if (row.expired && row.expired < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
    return null;
  }
  try {
    return JSON.parse(row.sess);
  } catch (_) {
    return null;
  }
}

function setSession(sid, sess, maxAgeMs) {
  const expired = Date.now() + (Number(maxAgeMs) > 0 ? Number(maxAgeMs) : 24 * 60 * 60 * 1000);
  db.prepare(
    `INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)
     ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired = excluded.expired`
  ).run(sid, JSON.stringify(sess), expired);
}

function destroySession(sid) {
  db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
}

function touchSession(sid, maxAgeMs) {
  const expired = Date.now() + (Number(maxAgeMs) > 0 ? Number(maxAgeMs) : 24 * 60 * 60 * 1000);
  db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?').run(expired, sid);
}

function cleanupExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
}

function getAllOrders() {
  return db
    .prepare('SELECT * FROM orders ORDER BY placed_at DESC')
    .all()
    .map(mapOrderRow);
}

const ACTIVE_ORDER_HOURS = 24;

function getOrderAgeMs(order) {
  const t = new Date(order.placedAt).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Date.now() - t;
}

function isActiveOrder(order, hours = ACTIVE_ORDER_HOURS) {
  return getOrderAgeMs(order) < hours * 60 * 60 * 1000;
}

function getActiveOrders(hours = ACTIVE_ORDER_HOURS) {
  return getAllOrders().filter((order) => isActiveOrder(order, hours));
}

function getArchivedOrders(hours = ACTIVE_ORDER_HOURS) {
  return getAllOrders().filter((order) => !isActiveOrder(order, hours));
}

function formatArchiveDateKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatArchiveDateLabel(dateKey) {
  if (!dateKey || dateKey === 'Unknown date') return dateKey || 'Unknown date';
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/** Orders older than 24h — kept in backend, grouped date-wise */
function getOrdersArchiveByDate(hours = ACTIVE_ORDER_HOURS) {
  const archived = getArchivedOrders(hours);
  const byDate = new Map();

  archived.forEach((order) => {
    const key = formatArchiveDateKey(order.placedAt);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(order);
  });

  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  return {
    hours,
    totalArchived: archived.length,
    dates: dates.map((dateKey) => {
      const orders = byDate.get(dateKey) || [];
      const revenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      return {
        dateKey,
        dateLabel: formatArchiveDateLabel(dateKey),
        count: orders.length,
        revenue,
        orders,
        details: orders
          .filter((order) => order.orderDetails && order.orderDetails.fullName)
          .map((order) => ({
            orderId: order.id,
            username: order.username,
            serviceType: order.serviceType,
            orderDetails: order.orderDetails,
            items: order.items,
            total: order.total,
            paymentMethod: order.paymentMethod,
            status: order.status,
            placedAt: order.placedAt
          }))
      };
    })
  };
}

function updateOrderStatus(orderId, status) {
  const allowed = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'paid', 'cancelled'];
  if (!allowed.includes(status)) return null;

  const done = status === 'delivered' || status === 'cancelled';
  if (done) {
    db.prepare(
      `UPDATE orders
       SET status = ?, completed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`
    ).run(status, orderId);
  } else {
    db.prepare(
      `UPDATE orders
       SET status = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(status, orderId);
  }
  return getOrderById(orderId);
}

function createContactMessage({ name, email, message }) {
  const result = db
    .prepare('INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)')
    .run(name, email, message);
  return getContactMessageById(result.lastInsertRowid);
}

function getContactMessageById(id) {
  return db
    .prepare('SELECT id, name, email, message, created_at FROM contact_messages WHERE id = ?')
    .get(id);
}

function getAllContactMessages() {
  return db
    .prepare('SELECT id, name, email, message, created_at FROM contact_messages ORDER BY created_at DESC')
    .all();
}

function createCustomerMessage({
  orderId,
  phone,
  message,
  status,
  channel,
  customerName,
  billTotal,
  mediaType,
  receiptCode,
  sendMethod,
  lastError
}) {
  const now = new Date().toISOString();
  const code =
    receiptCode ||
    `CC-WA-${orderId || 'T'}-${Date.now().toString(36).toUpperCase()}`;

  // Reuse open pending/failed row for the same order to avoid duplicate ledger noise
  if (orderId) {
    const existing = db
      .prepare(
        `SELECT id FROM customer_messages
         WHERE order_id = ? AND status IN ('pending', 'queued', 'ready', 'failed')
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(orderId);

    if (existing?.id) {
      db.prepare(
        `UPDATE customer_messages SET
          phone = ?,
          message = ?,
          status = ?,
          channel = ?,
          customer_name = COALESCE(?, customer_name),
          bill_total = COALESCE(?, bill_total),
          media_type = COALESCE(?, media_type),
          receipt_code = COALESCE(receipt_code, ?),
          send_method = COALESCE(?, send_method),
          last_error = ?,
          attempt_count = attempt_count + 1,
          updated_at = ?
         WHERE id = ?`
      ).run(
        phone,
        message,
        status || 'pending',
        channel || 'whatsapp',
        customerName || null,
        billTotal != null ? Number(billTotal) : null,
        mediaType || 'png',
        code,
        sendMethod || null,
        lastError || null,
        now,
        existing.id
      );
      return getCustomerMessageById(existing.id);
    }
  }

  const result = db
    .prepare(
      `INSERT INTO customer_messages (
        order_id, phone, message, status, channel,
        customer_name, bill_total, media_type, receipt_code,
        send_method, attempt_count, last_error, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      orderId || null,
      phone,
      message,
      status || 'pending',
      channel || 'whatsapp',
      customerName || null,
      billTotal != null ? Number(billTotal) : null,
      mediaType || 'png',
      code,
      sendMethod || null,
      1,
      lastError || null,
      now
    );

  return getCustomerMessageById(result.lastInsertRowid);
}

function mapCustomerMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId,
    phone: row.phone,
    message: row.message,
    status: row.status,
    channel: row.channel,
    customerName: row.customerName || '',
    billTotal: row.billTotal != null ? Number(row.billTotal) : null,
    mediaType: row.mediaType || 'text',
    receiptCode: row.receiptCode || '',
    sendMethod: row.sendMethod || '',
    attemptCount: Number(row.attemptCount || 0),
    lastError: row.lastError || '',
    sentAt: row.sentAt || null,
    updatedAt: row.updatedAt || row.createdAt,
    createdAt: row.createdAt
  };
}

const CUSTOMER_MESSAGE_SELECT = `
  SELECT
    id,
    order_id AS orderId,
    phone,
    message,
    status,
    channel,
    customer_name AS customerName,
    bill_total AS billTotal,
    media_type AS mediaType,
    receipt_code AS receiptCode,
    send_method AS sendMethod,
    attempt_count AS attemptCount,
    last_error AS lastError,
    sent_at AS sentAt,
    updated_at AS updatedAt,
    created_at AS createdAt
  FROM customer_messages
`;

function getCustomerMessageById(id) {
  const row = db.prepare(`${CUSTOMER_MESSAGE_SELECT} WHERE id = ?`).get(id);
  return mapCustomerMessageRow(row);
}

function getAllCustomerMessages() {
  return db
    .prepare(`${CUSTOMER_MESSAGE_SELECT} ORDER BY datetime(COALESCE(updated_at, created_at)) DESC`)
    .all()
    .map(mapCustomerMessageRow);
}

function normalizeMessageCategory(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'sent') return 'sent';
  if (s === 'failed') return 'failed';
  return 'pending';
}

function getCustomerMessagesByCategory(query = '') {
  const q = String(query || '').trim().toLowerCase();
  let all = getAllCustomerMessages();

  if (q) {
    all = all.filter((entry) => {
      const hay = [
        entry.phone,
        entry.customerName,
        entry.message,
        entry.receiptCode,
        entry.orderId,
        entry.status,
        entry.sendMethod
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const sent = [];
  const pending = [];
  const failed = [];

  all.forEach((entry) => {
    const category = normalizeMessageCategory(entry.status);
    const item = { ...entry, category };
    if (category === 'sent') sent.push(item);
    else if (category === 'failed') failed.push(item);
    else pending.push(item);
  });

  return {
    all,
    sent,
    pending,
    failed,
    counts: {
      sent: sent.length,
      pending: pending.length,
      failed: failed.length,
      total: all.length
    }
  };
}

function getPendingCustomerMessages() {
  return getCustomerMessagesByCategory().pending;
}

function markCustomerMessageSent(id, channelOrOpts = 'whatsapp') {
  const opts =
    typeof channelOrOpts === 'string'
      ? { channel: channelOrOpts, sendMethod: 'whatsapp' }
      : channelOrOpts || {};
  const channel = opts.channel || 'whatsapp';
  const sendMethod = opts.sendMethod || 'whatsapp';
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE customer_messages
       SET status = 'sent',
           channel = COALESCE(?, channel),
           send_method = COALESCE(?, send_method),
           sent_at = COALESCE(sent_at, ?),
           last_error = NULL,
           updated_at = ?
       WHERE id = ?`
    )
    .run(channel, sendMethod, now, now, id);
  if (!result.changes) return null;
  return getCustomerMessageById(id);
}

function markCustomerMessageFailed(id, channelOrOpts = 'whatsapp') {
  const opts =
    typeof channelOrOpts === 'string'
      ? { channel: channelOrOpts, lastError: null, sendMethod: null }
      : channelOrOpts || {};
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE customer_messages
       SET status = 'failed',
           channel = COALESCE(?, channel),
           send_method = COALESCE(?, send_method),
           last_error = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .run(
      opts.channel || 'whatsapp',
      opts.sendMethod || null,
      opts.lastError || null,
      now,
      id
    );
  if (!result.changes) return null;
  return getCustomerMessageById(id);
}

function getCustomerDetailsForAdmin(options = {}) {
  const { activeOnly = true, hours = ACTIVE_ORDER_HOURS } = options;
  const source = activeOnly ? getActiveOrders(hours) : getAllOrders();
  return source
    .filter((order) => order.orderDetails && order.orderDetails.fullName)
    .map((order) => ({
      orderId: order.id,
      username: order.username,
      serviceType: order.serviceType,
      orderDetails: order.orderDetails,
      items: order.items,
      total: order.total,
      paymentMethod: order.paymentMethod,
      status: order.status,
      placedAt: order.placedAt
    }));
}

function getAdminStats() {
  const totals = db
    .prepare(`
      SELECT
        COUNT(*) AS totalOrders,
        COALESCE(SUM(total), 0) AS totalRevenue,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'confirmed', 'preparing') THEN 1 ELSE 0 END), 0) AS activeOrders
      FROM orders
    `)
    .get();

  const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const menuItems = db.prepare('SELECT COUNT(*) AS c FROM menu_items WHERE available = 1').get().c;

  return {
    totalOrders: totals.totalOrders,
    totalRevenue: totals.totalRevenue,
    activeOrders: totals.activeOrders,
    totalUsers: users,
    menuItems
  };
}

function getAppMeta(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setAppMeta(key, value) {
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, String(value ?? ''));
}

function getSmsSettings() {
  const fast2smsKey = getAppMeta('sms_fast2sms_key', '') || process.env.FAST2SMS_API_KEY || '';
  const textlocalKey = getAppMeta('sms_textlocal_key', '') || process.env.TEXTLOCAL_API_KEY || '';
  const textbeltKey = getAppMeta('sms_textbelt_key', '') || process.env.TEXTBELT_API_KEY || '';
  const webhookUrl = getAppMeta('sms_webhook_url', '') || process.env.SMS_WEBHOOK_URL || '';
  const androidUrl = getAppMeta('sms_android_url', '') || process.env.SMS_ANDROID_URL || '';
  const androidUser = getAppMeta('sms_android_user', '') || process.env.SMS_ANDROID_USER || '';
  const androidPass = getAppMeta('sms_android_pass', '') || process.env.SMS_ANDROID_PASS || '';
  const twilioSid = getAppMeta('sms_twilio_sid', '') || process.env.TWILIO_ACCOUNT_SID || '';
  const twilioToken = getAppMeta('sms_twilio_token', '') || process.env.TWILIO_AUTH_TOKEN || '';
  const twilioFrom = getAppMeta('sms_twilio_from', '') || process.env.TWILIO_FROM_NUMBER || '';

  const hasGateway = Boolean(
    fast2smsKey ||
      textlocalKey ||
      textbeltKey ||
      webhookUrl ||
      androidUrl ||
      (twilioSid && twilioToken && twilioFrom)
  );

  return {
    provider: getAppMeta('sms_provider', 'fast2sms'),
    fast2smsKey,
    textlocalKey,
    textbeltKey,
    twilioSid,
    twilioToken,
    twilioFrom,
    senderId: getAppMeta('sms_sender_id', 'FSTSMS'),
    webhookUrl,
    androidUrl,
    androidUser,
    androidPass,
    configured: hasGateway,
    easyMode: false
  };
}

function saveSmsSettings(settings = {}) {
  if (settings.provider != null) setAppMeta('sms_provider', settings.provider);
  if (settings.fast2smsKey != null && String(settings.fast2smsKey).trim()) {
    setAppMeta('sms_fast2sms_key', String(settings.fast2smsKey).trim());
  }
  if (settings.textlocalKey != null && String(settings.textlocalKey).trim()) {
    setAppMeta('sms_textlocal_key', String(settings.textlocalKey).trim());
  }
  if (settings.textbeltKey != null && String(settings.textbeltKey).trim()) {
    setAppMeta('sms_textbelt_key', String(settings.textbeltKey).trim());
  }
  if (settings.twilioSid != null) setAppMeta('sms_twilio_sid', settings.twilioSid);
  if (settings.twilioToken != null) setAppMeta('sms_twilio_token', settings.twilioToken);
  if (settings.twilioFrom != null) setAppMeta('sms_twilio_from', settings.twilioFrom);
  if (settings.senderId != null) setAppMeta('sms_sender_id', settings.senderId);
  if (settings.webhookUrl != null) setAppMeta('sms_webhook_url', settings.webhookUrl);
  if (settings.androidUrl != null) setAppMeta('sms_android_url', settings.androidUrl);
  if (settings.androidUser != null) setAppMeta('sms_android_user', settings.androidUser);
  if (settings.androidPass != null && String(settings.androidPass).trim()) {
    setAppMeta('sms_android_pass', String(settings.androidPass).trim());
  }
  return getSmsSettings();
}

initDb();

module.exports = {
  findUserByCredentials,
  findUserByUsername,
  findUserByEmail,
  findUserByPhone,
  createUser,
  recordUserLogin,
  normalizeAuthEmail,
  normalizeAuthPhone,
  normalizeAuthIdentifier,
  getAllUsers,
  getMenuItems,
  getMenuItemByName,
  createOrder,
  getOrderById,
  getOrderByInvoiceToken,
  ensureInvoiceToken,
  getOrdersByUserId,
  getAllOrders,
  getActiveOrders,
  getArchivedOrders,
  getOrdersArchiveByDate,
  updateOrderStatus,
  getUserCart,
  saveUserCart,
  clearUserCart,
  getSession,
  setSession,
  destroySession,
  touchSession,
  cleanupExpiredSessions,
  getAppMeta,
  setAppMeta,
  getAdminStats,
  createContactMessage,
  getAllContactMessages,
  createCustomerMessage,
  getCustomerMessageById,
  getAllCustomerMessages,
  getCustomerMessagesByCategory,
  getPendingCustomerMessages,
  markCustomerMessageSent,
  markCustomerMessageFailed,
  getCustomerDetailsForAdmin,
  getSmsSettings,
  saveSmsSettings,
  getAppMeta,
  setAppMeta
};
