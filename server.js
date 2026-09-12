const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// Load optional .env for SMS keys
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  }
} catch (err) {
  console.warn('Could not load .env:', err.message);
}

const db = require('./db/mongo');
const { getMenuCategories } = require('./db/load-menu');
const {
  sendNormalTextMessage,
  normalizePhone,
  extractOrderPhones,
  buildOrderConfirmationMessage,
  buildWhatsAppUrl,
  deliverWhatsAppBill,
  sendWhatsAppImage
} = require('./db/messaging');
const {
  buildBill,
  buildWhatsAppBillCaption
} = require('./db/bill-template');

const app = express();
const PORT = process.env.PORT || 8080;

// Allow local Live Server / preview pages to call this API
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
      origin.endsWith('netlify.app'))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const MERCHANT_UPI_ID = 'naveen7122004-1@okaxis';

function calculateOrderTotal(cart) {
  const items = cart || [];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { subtotal, coupon: 0, platformFee: 0, total: subtotal };
}

function toClientUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email || null,
    phone: user.phone || null
  };
}

async function flushPendingCustomerMessages() {
  const pending = await db.getPendingCustomerMessages();
  let attempted = 0;
  let sent = 0;
  const links = [];
  const seen = new Set();

  for (const entry of pending) {
    const dedupe = `${entry.phone}|${entry.message}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    if (attempted >= 10) break;

    attempted += 1;
    const delivery = await sendNormalTextMessage(entry.phone, entry.message);
    if (delivery.delivered && delivery.whatsappUrl) {
      await db.markCustomerMessageSent(entry.id, 'whatsapp');
      for (const matching of pending.filter((p) => p.phone === entry.phone && p.message === entry.message)) {
        await db.markCustomerMessageSent(matching.id, 'whatsapp');
      }
      sent += 1;
      links.push({ phone: delivery.phone, whatsappUrl: delivery.whatsappUrl });
    }
  }

  return { attempted, sent, links, lastError: null };
}

async function getPublicIp() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip || '';
  } catch (_) {
    return '';
  }
}

function getPublicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '');
  }
  if (!req) return '';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return host ? `${proto}://${host}` : '';
}

function buildInvoiceDownloadUrl(req, token) {
  const base = getPublicBaseUrl(req);
  // Pretty path so WhatsApp shows "Download-Invoice" in the link
  if (!base || !token) return `/Download-Invoice/${token}`;
  return `${base}/Download-Invoice/${token}`;
}

async function sendOrderConfirmationMessage(order, req = null) {
  // Fetch phones from order/bill details and prepare WhatsApp for each
  const phones = extractOrderPhones(order.orderDetails || {}, { allowUnknown: true });
  if (!phones.length) {
    return {
      success: false,
      message: 'Enter at least one valid mobile / WhatsApp number in Details (or send with an unknown number from Admin)',
      customerMessage: null
    };
  }

  const withToken = (await db.ensureInvoiceToken(order.id)) || order;
  const bill = buildBill(withToken);
  const caption = buildWhatsAppBillCaption(withToken);
  const customerName = withToken.orderDetails?.fullName || withToken.username || 'Customer';

  const deliveries = [];
  const messageRecords = [];
  let firstLinks = { whatsappUrl: '', whatsappAppUrl: '' };

  for (const phone of phones) {
    const delivery = await deliverWhatsAppBill(phone, caption);
    const links = buildWhatsAppUrl(phone, caption);
    if (!firstLinks.whatsappUrl) firstLinks = links;

    const saved = await db.createCustomerMessage({
      orderId: withToken.id,
      phone: delivery.phone || phone,
      message: caption,
      status: delivery.delivered ? 'pending' : 'failed',
      channel: 'whatsapp',
      customerName,
      billTotal: withToken.total,
      mediaType: 'png',
      sendMethod: null,
      lastError: delivery.error || null
    });

    deliveries.push({ ...delivery, whatsappUrl: links.whatsappUrl, whatsappAppUrl: links.whatsappAppUrl });
    messageRecords.push(saved);
  }

  try {
    await db.setAppMeta('sms_last_error', '');
    await db.setAppMeta('sms_provider', 'whatsapp');
  } catch (_) {
    /* ignore */
  }

  const ok = deliveries.some((d) => d.delivered && (d.whatsappUrl || d.whatsappAppUrl));
  return {
    success: ok,
    easy: true,
    apiSent: false,
    phone: phones[0],
    phones,
    customerMessage: caption,
    caption,
    messageRecord: messageRecords[0] || null,
    messageRecords,
    channel: 'whatsapp',
    mediaType: 'png',
    invoiceToken: withToken.invoiceToken,
    invoiceUrl: buildInvoiceDownloadUrl(req, withToken.invoiceToken),
    whatsappUrl: firstLinks.whatsappUrl || '',
    whatsappAppUrl: firstLinks.whatsappAppUrl || '',
    whatsappLinks: deliveries.map((d) => ({
      phone: d.phone,
      whatsappUrl: d.whatsappUrl || '',
      whatsappAppUrl: d.whatsappAppUrl || ''
    })),
    messageText: caption,
    orderId: withToken.id,
    svg: bill.svg,
    error: deliveries.find((d) => d.error)?.error || null,
    configured: true
  };
}

async function completeOrder(req, paymentMeta = {}) {
  const cart = req.session.cart || [];
  const orderDetails = req.session.orderDetails;

  if (!orderDetails?.serviceType) {
    return null;
  }

  const totals = calculateOrderTotal(cart);
  const paymentMethod = paymentMeta.paymentMethod || 'card';

  const order = await db.createOrder({
    userId: req.session.user.id,
    username: req.session.user.username,
    items: [...cart],
    subtotal: totals.subtotal,
    coupon: totals.coupon,
    platformFee: totals.platformFee,
    total: totals.total,
    paymentMethod,
    paymentMeta,
    serviceType: orderDetails.serviceType,
    orderDetails,
    status: paymentMethod === 'cod' ? 'confirmed' : 'paid'
  });

  const notification = await sendOrderConfirmationMessage(order, req);

  req.session.cart = [];
  req.session.lastOrder = { id: order.id, total: order.total, status: order.status };
  delete req.session.pendingUpiPayment;
  delete req.session.orderDetails;
  await db.clearUserCart(req.session.user.id);

  return { order, notification };
}

function validateOrderDetails(body) {
  const serviceType = String(body.serviceType || '').trim();
  const fullName = String(body.fullName || '').trim();
  const phones = extractOrderPhones({
    phone: body.phone,
    phones: body.phones,
    whatsappPhone: body.whatsappPhone,
    alternatePhone: body.alternatePhone,
    extraPhones: body.extraPhones
  });
  const phone = phones[0] || '';
  const email = String(body.email || '').trim();

  if (!['dining', 'delivery'].includes(serviceType)) {
    return { valid: false, message: 'Please select dine-in or delivery' };
  }

  if (fullName.length < 2) {
    return { valid: false, message: 'Please enter your full name' };
  }

  if (!phones.length) {
    return {
      valid: false,
      message: 'Please enter at least one valid 10-digit mobile number'
    };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, message: 'Please enter a valid email address' };
  }

  const notes = String(
    body.specialInstructions || body.orderNotes || body.diningNotes || body.deliveryNotes || body.deliveryInstructions || ''
  ).trim() || null;

  if (serviceType === 'dining') {
    return {
      valid: true,
      details: {
        serviceType: 'dining',
        fullName,
        phone,
        phones,
        email: email || null,
        specialInstructions: notes
      }
    };
  }

  const addressLine = String(body.addressLine || '').trim();
  const city = String(body.city || '').trim();
  const pincode = String(body.pincode || '').trim();

  if (addressLine.length < 10) {
    return { valid: false, message: 'Please enter a complete delivery address' };
  }

  if (city.length < 2) {
    return { valid: false, message: 'Please enter your city' };
  }

  if (!/^\d{6}$/.test(pincode)) {
    return { valid: false, message: 'Please enter a valid 6-digit pincode' };
  }

  return {
    valid: true,
    details: {
      serviceType: 'delivery',
      fullName,
      phone,
      phones,
      email: email || null,
      addressLine,
      landmark: String(body.landmark || '').trim() || null,
      city,
      pincode,
      preferredTime: String(body.preferredTime || body.deliveryTime || '').trim() || null,
      deliveryInstructions: notes
    }
  };
}

app.use(express.json({ limit: '10mb' }));

// Required on Render / reverse proxies so secure cookies & client IPs work
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000;

class MongoSessionStore extends session.Store {
  constructor() {
    super();
    db.initMongo().then(() => db.cleanupExpiredSessions()).catch(() => {});
  }

  get(sid, callback) {
    db.initMongo().then(() => db.getSession(sid)).then((data) => callback(null, data || null)).catch(callback);
  }

  set(sid, sess, callback) {
    const maxAge = sess?.cookie?.maxAge || SESSION_MAX_AGE;
    db.initMongo().then(() => db.setSession(sid, sess, maxAge)).then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback) {
    db.initMongo().then(() => db.destroySession(sid)).then(() => callback(null)).catch(callback);
  }

  touch(sid, sess, callback) {
    const maxAge = sess?.cookie?.maxAge || SESSION_MAX_AGE;
    db.initMongo().then(() => db.touchSession(sid, maxAge)).then(() => callback(null)).catch(callback);
  }
}

async function hydrateUserState(req) {
  if (!req.session.user?.id) return;
  const saved = await db.getUserCart(req.session.user.id);
  if (!Array.isArray(req.session.cart) || req.session.cart.length === 0) {
    req.session.cart = saved.cart || [];
  }
  if (!req.session.orderDetails && saved.orderDetails) {
    req.session.orderDetails = saved.orderDetails;
  }
}

async function persistUserState(req) {
  if (!req.session.user?.id) return;
  await db.saveUserCart(req.session.user.id, req.session.cart || [], req.session.orderDetails || null);
}

app.use(
  session({
    store: new MongoSessionStore(),
    secret: process.env.SESSION_SECRET || 'Delight-Cafe-secret-key',
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction
    }
  })
);
app.use(express.static(__dirname));

const reactDist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(reactDist)) {
  app.use('/app', express.static(reactDist, { index: false }));
  app.get(['/app', '/app/', '/app/*'], (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(reactDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Please log in first' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

app.get('/api/health', async (req, res) => {
  try {
    await db.initMongo();
    res.json({ success: true, status: 'ok', time: new Date().toISOString(), db: 'mongodb', env: db.describeMongoEnv() });
  } catch (error) {
    res.status(500).json({ success: false, status: 'db-error', time: new Date().toISOString(), message: db.formatMongoError(error), env: db.describeMongoEnv() });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    merchantUpiId: MERCHANT_UPI_ID,
    merchantName: 'Delight Cafe'
  });
});

app.get('/api/menu', async (req, res) => {
  const items = await db.getMenuItems();
  const category = String(req.query.category || '').trim();

  if (category) {
    const filtered = items.filter((item) => item.category === category);
    return res.json({ success: true, items: filtered, category });
  }

  res.json({ success: true, items });
});

app.get('/api/menu/categories', async (req, res) => {
  const items = await db.getMenuItems();
  res.json({ success: true, categories: getMenuCategories(items) });
});

app.post('/api/contact', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const message = String(req.body.message || '').trim();

  if (name.length < 2) {
    return res.status(400).json({ success: false, message: 'Please enter your name' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email' });
  }

  if (message.length < 10) {
    return res.status(400).json({ success: false, message: 'Message must be at least 10 characters' });
  }

  const saved = await db.createContactMessage({ name, email, message });
  res.json({ success: true, message: 'Thank you! We will get back to you soon.', id: saved.id });
});

app.post('/api/login', async (req, res) => {
  const identifier = String(req.body.identifier || req.body.username || req.body.email || req.body.phone || '').trim();
  const password = String(req.body.password || '').trim();

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please enter your mobile number or email, and your password'
    });
  }

  const parsed = db.normalizeAuthIdentifier(identifier);
  if (parsed.kind === 'invalid_email') {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }
  if (parsed.kind === 'invalid_phone') {
    return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
  }

  const user = await db.findUserByCredentials(identifier, password);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid mobile number / email or password'
    });
  }

  const loginRecord = await db.recordUserLogin(user, {
    identifier,
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
    userAgent: req.headers['user-agent'] || ''
  });

  req.session.user = toClientUser(user);
  await hydrateUserState(req);
  await persistUserState(req);
  res.json({
    success: true,
    user: req.session.user,
    userId: user.id,
    loginId: loginRecord?.id || null
  });
});

app.post('/api/register', async (req, res) => {
  const password = String(req.body.password || '').trim();
  const confirmPassword = String(req.body.confirmPassword || req.body.passwordConfirm || '').trim();
  const emailRaw = String(req.body.email || '').trim();
  const phoneRaw = String(req.body.phone || req.body.mobile || '').trim();

  const email = emailRaw ? db.normalizeAuthEmail(emailRaw) : '';
  const phone = phoneRaw ? db.normalizeAuthPhone(phoneRaw) : '';

  if (emailRaw && email === null) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address' });
  }
  if (phoneRaw && phone === null) {
    return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number' });
  }
  if (!email && !phone) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a mobile number or email address'
    });
  }
  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters'
    });
  }
  if (confirmPassword && password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  if (email && (await db.findUserByEmail(email))) {
    return res.status(409).json({
      success: false,
      message: 'An account with this email already exists. Please sign in or use a different email.'
    });
  }
  if (phone && (await db.findUserByPhone(phone))) {
    return res.status(409).json({
      success: false,
      message: 'An account with this mobile number already exists. Please sign in or use a different number.'
    });
  }

  // Prefer email as username when present; otherwise use phone
  let username = email || phone;
  if (await db.findUserByUsername(username)) {
    return res.status(409).json({
      success: false,
      message: 'An account with these details already exists. Please sign in instead.'
    });
  }

  try {
    const newUser = await db.createUser(username, password, {
      email: email || null,
      phone: phone || null
    });
    req.session.user = toClientUser(newUser);
    req.session.cart = [];
    await db.saveUserCart(newUser.id, [], null);
    await db.recordUserLogin(newUser, {
      identifier: username,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });
    res.json({
      success: true,
      user: req.session.user,
      userId: newUser.id
    });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return res.status(409).json({
        success: false,
        message: 'An account with these details already exists. Please sign in instead.'
      });
    }
    console.error('Register failed:', err.message);
    res.status(500).json({ success: false, message: 'Could not create account. Please try again.' });
  }
});

app.post('/api/logout', async (req, res) => {
  if (req.session.user?.id) {
    await persistUserState(req);
  }
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/check', async (req, res) => {
  if (req.session.user) {
    await hydrateUserState(req);
  }
  const cart = req.session.cart || [];
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user, cartCount });
  } else {
    res.json({ loggedIn: false, cartCount: 0 });
  }
});

app.get('/api/cart', requireAuth, async (req, res) => {
  await hydrateUserState(req);
  res.json({ success: true, cart: req.session.cart || [] });
});

app.post('/api/cart/add', requireAuth, async (req, res) => {
  const { name, quantity } = req.body;
  const menuItem = await db.getMenuItemByName(name);

  if (!menuItem || !quantity) {
    return res.status(400).json({ success: false, message: 'Invalid item or quantity' });
  }

  await hydrateUserState(req);
  req.session.cart = req.session.cart || [];
  const existing = req.session.cart.find((item) => item.name === name);

  if (existing) {
    existing.quantity += Number(quantity);
  } else {
    req.session.cart.push({
      name: menuItem.name,
      price: menuItem.price,
      quantity: Number(quantity),
      noPlatformFee: menuItem.noPlatformFee
    });
  }

  await persistUserState(req);
  res.json({ success: true, cart: req.session.cart });
});

app.patch('/api/cart/update', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const quantity = Number(req.body.quantity);

  if (!name || !Number.isFinite(quantity) || quantity < 1) {
    return res.status(400).json({ success: false, message: 'Invalid item or quantity' });
  }

  await hydrateUserState(req);
  req.session.cart = req.session.cart || [];
  const item = req.session.cart.find((entry) => entry.name === name);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found in cart' });
  }

  item.quantity = Math.min(100, Math.floor(quantity));
  await persistUserState(req);
  res.json({ success: true, cart: req.session.cart });
});

app.delete('/api/cart/item/:name', requireAuth, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  await hydrateUserState(req);
  req.session.cart = (req.session.cart || []).filter((entry) => entry.name !== name);
  await persistUserState(req);
  res.json({ success: true, cart: req.session.cart });
});

app.get('/api/cart/summary', requireAuth, async (req, res) => {
  await hydrateUserState(req);
  const cart = req.session.cart || [];
  const totals = calculateOrderTotal(cart);
  res.json({
    success: true,
    cart,
    totals,
    orderDetails: req.session.orderDetails || null
  });
});

app.get('/api/order-details', requireAuth, async (req, res) => {
  await hydrateUserState(req);
  res.json({ success: true, orderDetails: req.session.orderDetails || null });
});

app.post('/api/order-details', requireAuth, async (req, res) => {
  await hydrateUserState(req);
  const cart = req.session.cart || [];
  if (!cart.length) {
    return res.status(400).json({ success: false, message: 'Your cart is empty' });
  }

  const result = validateOrderDetails(req.body);
  if (!result.valid) {
    return res.status(400).json({ success: false, message: result.message });
  }

  req.session.orderDetails = result.details;
  await persistUserState(req);
  res.json({ success: true, orderDetails: req.session.orderDetails });
});

app.delete('/api/order-details', requireAuth, async (req, res) => {
  delete req.session.orderDetails;
  if (req.session.user?.id) {
    await db.saveUserCart(req.session.user.id, req.session.cart || [], null);
  }
  res.json({ success: true });
});

app.delete('/api/cart/clear', requireAuth, async (req, res) => {
  req.session.cart = [];
  delete req.session.orderDetails;
  if (req.session.user?.id) {
    await db.clearUserCart(req.session.user.id);
  }
  res.json({ success: true, cart: [] });
});

app.get('/api/orders', requireAuth, async (req, res) => {
  const status = String(req.query.status || 'all').toLowerCase();
  const orders = await db.getOrdersByUserId(req.session.user.id, { status });
  res.json({
    success: true,
    source: 'database',
    status,
    orders
  });
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  const order = await db.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const isOwner = order.userId === req.session.user.id;
  const isAdmin = req.session.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  res.json({ success: true, order });
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  res.json({ success: true, stats: await db.getAdminStats() });
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const scope = String(req.query.scope || 'active').toLowerCase();
  const orders = scope === 'all' ? await db.getAllOrders() : await db.getActiveOrders();
  res.json({
    success: true,
    scope: scope === 'all' ? 'all' : 'active',
    hours: 24,
    orders
  });
});

app.get('/api/admin/orders/archive', requireAdmin, async (req, res) => {
  const archive = await db.getOrdersArchiveByDate();
  res.json({
    success: true,
    message: 'Orders older than 24 hours are stored date-wise in the backend archive.',
    archive
  });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  res.json({ success: true, users: await db.getAllUsers() });
});

app.get('/api/admin/contact', requireAdmin, async (req, res) => {
  res.json({ success: true, messages: await db.getAllContactMessages() });
});

app.get('/api/admin/customer-details', requireAdmin, async (req, res) => {
  const scope = String(req.query.scope || 'active').toLowerCase();
  const details = await db.getCustomerDetailsForAdmin({
    activeOnly: scope !== 'all'
  });
  res.json({
    success: true,
    scope: scope === 'all' ? 'all' : 'active',
    hours: 24,
    details
  });
});

app.get('/api/admin/messages', requireAdmin, async (req, res) => {
  const grouped = await db.getCustomerMessagesByCategory(req.query.q || '');
  res.json({
    success: true,
    messages: grouped.all,
    sent: grouped.sent,
    pending: grouped.pending,
    failed: grouped.failed,
    counts: grouped.counts
  });
});

app.post('/api/admin/messages/:id/mark-sent', requireAdmin, async (req, res) => {
  const channel = String(req.body.channel || 'whatsapp').trim();
  const sendMethod = String(req.body.sendMethod || req.body.method || 'whatsapp').trim();
  const entry = await db.markCustomerMessageSent(req.params.id, { channel, sendMethod });
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Message not found' });
  }
  res.json({ success: true, message: 'Bill delivery stored in backend', entry });
});

app.post('/api/admin/messages/:id/mark-failed', requireAdmin, async (req, res) => {
  const channel = String(req.body.channel || 'whatsapp').trim();
  const lastError = String(req.body.lastError || req.body.error || 'Send failed').trim();
  const sendMethod = String(req.body.sendMethod || req.body.method || '').trim() || null;
  const entry = await db.markCustomerMessageFailed(req.params.id, { channel, lastError, sendMethod });
  if (!entry) {
    return res.status(404).json({ success: false, message: 'Message not found' });
  }
  res.json({ success: true, message: 'Marked as failed', entry });
});

app.get('/api/admin/sms-settings', requireAdmin, (req, res) => {
  res.json({
    success: true,
    settings: {
      provider: 'whatsapp',
      configured: true,
      easyMode: true,
      channel: 'whatsapp',
      help: 'Bills are sent on WhatsApp to the mobile number entered in Details.'
    }
  });
});

app.post('/api/admin/sms-settings', requireAdmin, async (req, res) => {
  await db.saveSmsSettings({ provider: 'whatsapp' });
  res.json({
    success: true,
    message: 'WhatsApp bill delivery is enabled. No SMS gateway needed.',
    settings: { provider: 'whatsapp', configured: true, easyMode: true }
  });
});

app.post('/api/admin/sms-test', requireAdmin, async (req, res) => {
  const phone = normalizePhone(req.body.phone || '');
  const customMessage = String(req.body.message || '').trim();

  if (!/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Enter a valid 10-digit WhatsApp mobile number (starts with 6-9)'
    });
  }

  const text =
    customMessage ||
    `*Delight Cafe — Test Bill*\nHi! This is a test WhatsApp bill to +91${phone}.\nThank you!`;

  const delivery = await sendNormalTextMessage(phone, text);
  const saved = await db.createCustomerMessage({
    orderId: null,
    phone: delivery.phone || phone,
    message: text,
    status: delivery.delivered ? 'pending' : 'failed',
    channel: 'whatsapp',
    customerName: 'Test customer',
    billTotal: null,
    mediaType: 'text',
    lastError: delivery.error || null
  });

  res.json({
    success: Boolean(delivery.delivered && delivery.whatsappUrl),
    message: delivery.delivered
      ? `WhatsApp bill ready for +91${delivery.phone}. Opening chat…`
      : delivery.error || 'Could not prepare WhatsApp bill.',
    delivery: {
      ...delivery,
      messageId: saved?.id,
      receiptCode: saved?.receiptCode
    }
  });
});

app.post('/api/admin/messages/flush', requireAdmin, async (req, res) => {
  const flushed = await flushPendingCustomerMessages();
  res.json({
    success: true,
    message: `Prepared ${flushed.sent}/${flushed.attempted} WhatsApp bill(s)`,
    flushed
  });
});

app.post('/api/admin/orders/:id/send-message', requireAdmin, async (req, res) => {
  const order = await db.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const notification = await sendOrderConfirmationMessage(order, req);
  if (!notification.customerMessage) {
    return res.status(400).json({
      success: false,
      message: notification.message || 'Could not build WhatsApp bill for this order'
    });
  }

  res.json({
    success: notification.success,
    message: notification.success
      ? `Bill image ready — open WhatsApp for ${notification.phone}`
      : notification.error || 'Could not prepare WhatsApp bill.',
    notification
  });
});

/** Accept client-generated bill PNG and send it as a WhatsApp image to all bill phones */
app.post('/api/admin/orders/:id/send-bill-image', requireAdmin, async (req, res) => {
  const order = await db.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  // Phones: prefer explicit list from admin (includes unknown numbers),
  // otherwise fall back to numbers saved on the order / bill details.
  const overridePhones = extractOrderPhones(
    { phones: req.body?.phones, phone: req.body?.phone, unknownPhones: req.body?.unknownPhones },
    { allowUnknown: true }
  );
  const phones = overridePhones.length
    ? overridePhones
    : extractOrderPhones(order.orderDetails || {}, { allowUnknown: true });
  if (!phones.length) {
    return res.status(400).json({
      success: false,
      message: 'Enter at least one WhatsApp number (saved or unknown) to send this bill'
    });
  }

  const pngBase64 = String(req.body?.pngBase64 || '')
    .replace(/^data:image\/png;base64,/i, '')
    .trim();
  if (!pngBase64) {
    return res.status(400).json({
      success: false,
      message: 'Bill PNG image is required'
    });
  }

  let pngBuffer;
  try {
    pngBuffer = Buffer.from(pngBase64, 'base64');
  } catch (_) {
    return res.status(400).json({ success: false, message: 'Invalid bill PNG data' });
  }
  if (!pngBuffer.length) {
    return res.status(400).json({ success: false, message: 'Empty bill PNG data' });
  }

  const withToken = (await db.ensureInvoiceToken(order.id)) || order;
  const caption = buildWhatsAppBillCaption(withToken);
  const customerName = withToken.orderDetails?.fullName || withToken.username || 'Customer';
  const bill = buildBill(withToken);

  const results = [];
  const messageRecords = [];
  let anyApiSent = false;

  for (const phone of phones) {
    const apiResult = await sendWhatsAppImage(phone, { pngBuffer, caption });
    const links = buildWhatsAppUrl(phone, caption);
    if (apiResult.sent) anyApiSent = true;

    const saved = await db.createCustomerMessage({
      orderId: withToken.id,
      phone,
      message: caption,
      status: apiResult.sent ? 'sent' : 'pending',
      channel: 'whatsapp',
      customerName,
      billTotal: withToken.total,
      mediaType: 'png',
      sendMethod: apiResult.sent ? 'whatsapp_image' : null,
      lastError: apiResult.sent ? null : apiResult.error || apiResult.reason || null
    });

    let messageRecord = saved;
    if (apiResult.sent && saved?.id) {
      messageRecord =
        (await db.markCustomerMessageSent(saved.id, {
          channel: 'whatsapp',
          sendMethod: 'whatsapp_image'
        })) || saved;
    }

    messageRecords.push(messageRecord);
    results.push({
      phone,
      apiSent: Boolean(apiResult.sent),
      whatsappUrl: links.whatsappUrl || '',
      whatsappAppUrl: links.whatsappAppUrl || '',
      messageRecord,
      error: apiResult.sent ? null : apiResult.error || null,
      apiSkipReason: apiResult.reason || null
    });
  }

  const phoneList = phones.map((p) => `+91${p}`).join(', ');
  res.json({
    success: true,
    message: anyApiSent
      ? `Bill PNG sent on WhatsApp to ${phoneList}`
      : `Bill PNG ready for WhatsApp (${phoneList})`,
    notification: {
      success: true,
      easy: !anyApiSent,
      apiSent: anyApiSent,
      phone: phones[0],
      phones,
      caption,
      customerMessage: caption,
      messageRecord: messageRecords[0] || null,
      messageRecords,
      channel: 'whatsapp',
      mediaType: 'png',
      whatsappUrl: results[0]?.whatsappUrl || '',
      whatsappAppUrl: results[0]?.whatsappAppUrl || '',
      whatsappLinks: results.map((r) => ({
        phone: r.phone,
        whatsappUrl: r.whatsappUrl,
        whatsappAppUrl: r.whatsappAppUrl
      })),
      svg: bill.svg,
      error: results.find((r) => r.error)?.error || null,
      apiSkipReason: results.find((r) => r.apiSkipReason)?.apiSkipReason || null
    }
  });
});

app.get('/api/admin/orders/:id/bill.svg', requireAdmin, async (req, res) => {
  const order = await db.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).send('Order not found');
  }
  const bill = buildBill(order);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(bill.svg);
});

app.get('/api/admin/orders/:id/bill.json', requireAdmin, async (req, res) => {
  const order = await db.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  const withToken = (await db.ensureInvoiceToken(order.id)) || order;
  const bill = buildBill(withToken);
  const invoiceUrl = buildInvoiceDownloadUrl(req, withToken.invoiceToken);
  const caption = buildWhatsAppBillCaption(withToken);
  const phones = extractOrderPhones(withToken.orderDetails || {}, { allowUnknown: true });
  const phone = phones[0] || '';
  const links = phone ? buildWhatsAppUrl(phone, caption) : { whatsappUrl: '', whatsappAppUrl: '' };
  const whatsappLinks = phones.map((p) => {
    const l = buildWhatsAppUrl(p, caption);
    return {
      phone: p,
      whatsappUrl: l.whatsappUrl || '',
      whatsappAppUrl: l.whatsappAppUrl || ''
    };
  });
  res.json({
    success: true,
    orderId: withToken.id,
    phone,
    phones,
    orderDetails: withToken.orderDetails || {},
    customerName: withToken.orderDetails?.fullName || withToken.username || 'Customer',
    caption,
    invoiceToken: withToken.invoiceToken,
    invoiceUrl,
    whatsappUrl: links.whatsappUrl || '',
    whatsappAppUrl: links.whatsappAppUrl || '',
    whatsappLinks,
    svg: bill.svg
  });
});

app.patch('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const order = await db.updateOrderStatus(req.params.id, status);

  if (!order) {
    return res.status(400).json({ success: false, message: 'Invalid order or status' });
  }

  res.json({ success: true, order });
});

app.post('/api/payment/upi/initiate', requireAuth, (req, res) => {
  const cart = req.session.cart || [];

  if (cart.length === 0) {
    return res.status(400).json({ success: false, message: 'Your cart is empty' });
  }

  if (!req.session.orderDetails?.serviceType) {
    return res.status(400).json({ success: false, message: 'Please complete order details first' });
  }

  const { upiApp } = req.body;
  const { total } = calculateOrderTotal(cart);
  const txnId = `CC${Date.now()}`;

  req.session.pendingUpiPayment = {
    txnId,
    amount: total,
    upiApp: upiApp || 'UPI',
    startedAt: Date.now(),
    verifyCount: 0
  };

  res.json({
    success: true,
    txnId,
    amount: total,
    merchantUpiId: MERCHANT_UPI_ID
  });
});

app.post('/api/payment/upi/cancel', requireAuth, (req, res) => {
  delete req.session.pendingUpiPayment;
  res.json({ success: true });
});

app.post('/api/payment/upi/verify', requireAuth, async (req, res) => {
  const { txnId, returnedFromApp } = req.body;
  const pending = req.session.pendingUpiPayment;

  if (!pending || pending.txnId !== txnId) {
    return res.json({
      success: false,
      status: 'failed',
      message: 'Payment session expired. Please try again.'
    });
  }

  const elapsed = Date.now() - pending.startedAt;

  if (elapsed > 180000) {
    delete req.session.pendingUpiPayment;
    return res.json({
      success: false,
      status: 'failed',
      message: 'Payment timed out. Please try again.'
    });
  }

  if (!returnedFromApp) {
    return res.json({
      success: false,
      status: 'waiting',
      message: 'Complete payment in your UPI app, then return here.'
    });
  }

  if (elapsed < 4000) {
    return res.json({
      success: false,
      status: 'verifying',
      message: 'Connecting to your bank...'
    });
  }

  pending.verifyCount += 1;

  if (pending.verifyCount < 3) {
    return res.json({
      success: false,
      status: 'verifying',
      message: 'Verifying payment with bank...'
    });
  }

  const completed = await completeOrder(req, {
    paymentMethod: 'upi',
    upiApp: pending.upiApp,
    merchantUpiId: MERCHANT_UPI_ID,
    txnId: pending.txnId,
    bankVerified: true
  });

  if (!completed?.order) {
    return res.json({
      success: false,
      status: 'failed',
      message: 'Order details missing. Please fill the order form again.'
    });
  }

  res.json({
    success: true,
    status: 'verified',
    message: 'Payment verified successfully',
    order: completed.order,
    notification: completed.notification
  });
});

app.post('/api/checkout', requireAuth, async (req, res) => {
  const cart = req.session.cart || [];

  if (cart.length === 0) {
    return res.status(400).json({ success: false, message: 'Your cart is empty' });
  }

  if (!req.session.orderDetails?.serviceType) {
    return res.status(400).json({ success: false, message: 'Please complete order details first' });
  }

  const { paymentMethod, upiApp } = req.body;
  const completed = await completeOrder(req, {
    paymentMethod: paymentMethod || 'card',
    upiApp: upiApp || null,
    merchantUpiId: paymentMethod === 'upi' ? MERCHANT_UPI_ID : null
  });

  if (!completed?.order) {
    return res.status(400).json({ success: false, message: 'Could not create order. Please complete order details.' });
  }

  res.json({
    success: true,
    order: completed.order,
    notification: completed.notification
  });
});

function renderInvoicePage(order, bill, token, pageUrl = '') {
  const details = order.orderDetails || {};
  const name = details.fullName || order.username || 'Customer';
  const safeName = String(name).replace(/</g, '&lt;');
  const saveUrl = `/Download-Invoice/${encodeURIComponent(token)}/save`;
  const items = (order.items || [])
    .map(
      (item) =>
        `<tr><td>${String(item.name || '').replace(/</g, '&lt;')}</td><td>x${item.quantity || 1}</td><td>Rs.${Number(item.price || 0).toFixed(2)}</td></tr>`
    )
    .join('');
  const ogUrl = pageUrl || `/Download-Invoice/${encodeURIComponent(token)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Download Invoice · Delight Cafe #${order.id}</title>
  <meta name="description" content="Delight Cafe Invoice #${order.id} for ${safeName}. Total Rs.${Number(order.total || 0).toFixed(2)}" />
  <meta property="og:title" content="Download Invoice" />
  <meta property="og:description" content="Delight Cafe Invoice #${order.id} · Total Rs.${Number(order.total || 0).toFixed(2)} · Tap to view your bill" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${ogUrl}" />
  <meta property="og:site_name" content="Delight Cafe" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Download Invoice" />
  <meta name="twitter:description" content="Delight Cafe Invoice #${order.id} — view your bill" />
  <style>
    :root { --ink:#1a2f2a; --gold:#4f9a82; --bg:#eef3f0; --gold-light:#b7e0d1; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Georgia, "Times New Roman", serif; background:linear-gradient(160deg,#1a2f2a,#31554b); color:var(--ink); min-height:100vh; padding:24px 16px 48px; }
    .wrap { max-width:560px; margin:0 auto; }
    .hero { text-align:center; color:#b7e0d1; margin-bottom:18px; }
    .hero h1 { margin:0; font-size:1.75rem; letter-spacing:0.03em; }
    .hero .tag { display:inline-block; margin-top:10px; padding:6px 14px; border-radius:999px; border:1px solid rgba(79,154,130,.55); color:#b7e0d1; font-family:Segoe UI,Arial,sans-serif; font-size:.85rem; font-weight:700; }
    .hero p { margin:10px 0 0; color:rgba(183,224,209,.8); font-family:Segoe UI,Arial,sans-serif; font-size:.95rem; }
    .card { background:var(--bg); border:2px solid var(--gold); border-radius:18px; padding:22px; box-shadow:0 18px 40px rgba(0,0,0,.28); }
    .actions { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin:0 0 16px; }
    .btn { display:inline-flex; align-items:center; justify-content:center; padding:12px 18px; border-radius:999px; text-decoration:none; font-family:Segoe UI,Arial,sans-serif; font-weight:700; font-size:.95rem; border:none; cursor:pointer; }
    .btn-primary { background:var(--ink); color:#b7e0d1; }
    .btn-secondary { background:transparent; color:var(--ink); border:1.5px solid var(--gold); }
    .meta { font-family:Segoe UI,Arial,sans-serif; font-size:.9rem; color:#4a5752; margin:0 0 14px; line-height:1.5; }
    table { width:100%; border-collapse:collapse; font-family:Segoe UI,Arial,sans-serif; font-size:.9rem; }
    th, td { padding:8px 4px; border-bottom:1px solid #b7e0d1; text-align:left; }
    th { color:#2f6f5c; font-size:.75rem; letter-spacing:.06em; text-transform:uppercase; }
    .total { margin-top:14px; text-align:right; font-family:Segoe UI,Arial,sans-serif; font-size:1.05rem; font-weight:700; }
    .preview { margin-top:18px; border-radius:12px; overflow:hidden; border:1px solid #b7e0d1; background:#fff; }
    .preview img { display:block; width:100%; height:auto; }
    .note { margin-top:14px; text-align:center; font-family:Segoe UI,Arial,sans-serif; font-size:.8rem; color:#5a6661; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <h1>Download Invoice</h1>
      <div class="tag">Delight Cafe · Invoice #${order.id}</div>
      <p>Your bill is ready to view below</p>
    </div>
    <div class="card">
      <p class="meta">
        <strong>${safeName}</strong><br/>
        Total: Rs.${Number(order.total || 0).toFixed(2)} · ${(order.paymentMethod || 'N/A').toUpperCase()}<br/>
        Status: ${String(order.status || '').replace(/_/g, ' ')}
      </p>
      <div class="actions">
        <a class="btn btn-primary" href="#bill-view">View Bill</a>
        <button class="btn btn-secondary" type="button" onclick="window.print()">Print</button>
        <a class="btn btn-secondary" href="${saveUrl}">Save file</a>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>${items || '<tr><td colspan="3">No items</td></tr>'}</tbody>
      </table>
      <div class="total">Total: Rs.${Number(order.total || 0).toFixed(2)}</div>
      <div class="preview" id="bill-view">
        <img alt="Delight Cafe Invoice" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(bill.svg)}" />
      </div>
      <p class="note">This page shows your Delight Cafe bill. Use <strong>Save file</strong> only if you want a copy on your phone.</p>
    </div>
  </div>
</body>
</html>`;
}

async function sendInvoiceView(req, res, token) {
  const order = await db.getOrderByInvoiceToken(token);
  if (!order) {
    return res.status(404).send('Invoice not found or link expired.');
  }
  const bill = buildBill(order);
  const pageUrl = buildInvoiceDownloadUrl(req, order.invoiceToken);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(renderInvoicePage(order, bill, order.invoiceToken, pageUrl));
}

// Pretty "Download Invoice" link — opens bill VIEW page (not a direct file download)
app.get('/Download-Invoice/:token', async (req, res) => {
  await sendInvoiceView(req, res, req.params.token);
});

app.get('/invoice/:token', (req, res) => {
  // Keep old links working — redirect to Download Invoice view
  res.redirect(302, `/Download-Invoice/${encodeURIComponent(req.params.token)}`);
});

app.get('/Download-Invoice/:token/save', async (req, res) => {
  const order = await db.getOrderByInvoiceToken(req.params.token);
  if (!order) {
    return res.status(404).send('Invoice not found');
  }
  const bill = buildBill(order);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Delight-Cafe-Invoice-${order.id}.svg"`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.send(bill.svg);
});

app.get('/invoice/:token/download', (req, res) => {
  res.redirect(302, `/Download-Invoice/${encodeURIComponent(req.params.token)}/save`);
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
  next(err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Delight Cafe running at http://localhost:${PORT}`);
});
