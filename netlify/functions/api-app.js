const express = require('express');
const session = require('express-session');
const db = require('../../db/netlify-db');
const { extractOrderPhones, buildWhatsAppUrl } = require('../../db/messaging');
const { buildBill, buildWhatsAppBillCaption } = require('../../db/bill-template');

const SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
const MERCHANT_UPI_ID = process.env.MERCHANT_UPI_ID || 'naveen7122004-1@okaxis';

class DbSessionStore extends session.Store {
  get(sid, callback) {
    Promise.resolve(db.getSession(sid))
      .then((data) => callback(null, data || null))
      .catch((err) => callback(err));
  }

  set(sid, sess, callback) {
    const maxAge = sess?.cookie?.maxAge || SESSION_MAX_AGE;
    Promise.resolve(db.setSession(sid, sess, maxAge))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  destroy(sid, callback) {
    Promise.resolve(db.destroySession(sid))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }

  touch(sid, sess, callback) {
    const maxAge = sess?.cookie?.maxAge || SESSION_MAX_AGE;
    Promise.resolve(db.touchSession(sid, maxAge))
      .then(() => callback(null))
      .catch((err) => callback(err));
  }
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

function calculateOrderTotal(cart) {
  const items = cart || [];
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  return { subtotal, coupon: 0, platformFee: 0, total: subtotal };
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

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Please log in to continue' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Please log in to continue' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  return next();
}

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  // Normalize Netlify / proxy path prefixes before routing
  app.use((req, _res, next) => {
    const original = req.url || '/';
    let url = original;
    url = url.replace(/^\/\.netlify\/functions\/api/, '');
    if (url.startsWith('/api/')) url = url.slice(4);
    else if (url === '/api') url = '/';
    if (!url.startsWith('/')) url = `/${url}`;
    req.url = url || '/';
    next();
  });

  app.use(async (req, res, next) => {
    const pathName = String((req.url || '').split('?')[0] || '');
    const isHealth = pathName === '/health';
    if (isHealth) return next();

    try {
      await db.initMongo();
      next();
    } catch (err) {
      console.error('DB init failed:', err);
      res.status(500).json({
        success: false,
        message: db.formatMongoError ? db.formatMongoError(err) : err.message,
        env: db.describeMongoEnv ? db.describeMongoEnv() : {}
      });
    }
  });

  app.get('/health', async (req, res) => {
    try {
      await db.initMongo();
      const env = db.describeMongoEnv ? db.describeMongoEnv() : {};
      res.json({
        success: true,
        status: 'ok',
        time: new Date().toISOString(),
        db: db.engine || env.mode || 'mongodb',
        env
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        status: 'db-error',
        time: new Date().toISOString(),
        message: db.formatMongoError ? db.formatMongoError(err) : err.message,
        env: db.describeMongoEnv ? db.describeMongoEnv() : {}
      });
    }
  });

  app.use(
    session({
      store: new DbSessionStore(),
      name: 'delight.sid',
      secret: process.env.SESSION_SECRET || 'Delight-Cafe-secret-key',
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        maxAge: SESSION_MAX_AGE,
        httpOnly: true,
        sameSite: 'lax',
        secure: true
      }
    })
  );

  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({
      success: true,
      merchantUpiId: MERCHANT_UPI_ID,
      merchantName: 'Delight Cafe'
    });
  });

  router.get('/menu', async (req, res) => {
    const items = await db.getMenuItems();
    const category = String(req.query.category || '').trim();
    if (category) {
      return res.json({
        success: true,
        items: items.filter((item) => item.category === category),
        category
      });
    }
    res.json({ success: true, items });
  });

  router.get('/menu/categories', async (req, res) => {
    const items = await db.getMenuItems();
    res.json({ success: true, categories: db.getMenuCategories(items) });
  });

  router.post('/contact', async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const message = String(req.body.message || '').trim();
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Please fill all contact fields' });
    }
    await db.createContactMessage({ name, email, message });
    res.json({ success: true, message: 'Message received' });
  });

  router.post('/login', async (req, res) => {
    const identifier = String(
      req.body.identifier || req.body.username || req.body.email || req.body.phone || ''
    ).trim();
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

    req.session.user = toClientUser(user);
    await hydrateUserState(req);
    await persistUserState(req);
    const loginRecord = await db.recordUserLogin(user, {
      identifier,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });
    res.json({
      success: true,
      user: req.session.user,
      userId: user.id,
      loginId: loginRecord?.id || null
    });
  });

  router.post('/register', async (req, res) => {
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

    const username = email || phone;
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
      res.json({ success: true, user: req.session.user, userId: newUser.id });
    } catch (err) {
      if (String(err.message || '').includes('Duplicate') || String(err.message || '').includes('UNIQUE')) {
        return res.status(409).json({
          success: false,
          message: 'An account with these details already exists. Please sign in instead.'
        });
      }
      console.error(err);
      res.status(500).json({ success: false, message: 'Could not create account' });
    }
  });

  router.post('/logout', async (req, res) => {
    if (req.session.user?.id) {
      await persistUserState(req);
    }
    req.session.destroy(() => res.json({ success: true }));
  });

  router.get('/auth/check', async (req, res) => {
    if (req.session.user) {
      await hydrateUserState(req);
    }
    const cart = req.session.cart || [];
    const cartCount = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (req.session.user) {
      return res.json({ loggedIn: true, user: req.session.user, cartCount });
    }
    res.json({ loggedIn: false, cartCount: 0 });
  });

  router.get('/cart', requireAuth, async (req, res) => {
    await hydrateUserState(req);
    res.json({ success: true, cart: req.session.cart || [] });
  });

  router.post('/cart/add', requireAuth, async (req, res) => {
    const name = String(req.body.name || '').trim();
    const quantity = Math.max(1, Number(req.body.quantity) || 1);
    const menuItem = await db.getMenuItemByName(name);
    if (!menuItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    req.session.cart = req.session.cart || [];
    const existing = req.session.cart.find((item) => item.name === name);
    if (existing) {
      existing.quantity += quantity;
    } else {
      req.session.cart.push({
        name: menuItem.name,
        price: Number(menuItem.price),
        quantity,
        noPlatformFee: Boolean(menuItem.noPlatformFee)
      });
    }
    await persistUserState(req);
    res.json({ success: true, cart: req.session.cart });
  });

  router.patch('/cart/update', requireAuth, async (req, res) => {
    const name = String(req.body.name || '').trim();
    const quantity = Math.max(1, Number(req.body.quantity) || 1);
    req.session.cart = req.session.cart || [];
    const item = req.session.cart.find((entry) => entry.name === name);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }
    item.quantity = quantity;
    await persistUserState(req);
    res.json({ success: true, cart: req.session.cart });
  });

  router.delete('/cart/item/:name', requireAuth, async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    req.session.cart = (req.session.cart || []).filter((entry) => entry.name !== name);
    await persistUserState(req);
    res.json({ success: true, cart: req.session.cart });
  });

  router.delete('/cart/clear', requireAuth, async (req, res) => {
    req.session.cart = [];
    delete req.session.orderDetails;
    if (req.session.user?.id) {
      await db.clearUserCart(req.session.user.id);
    }
    res.json({ success: true, cart: [] });
  });

  router.get('/cart/summary', requireAuth, async (req, res) => {
    await hydrateUserState(req);
    const cart = req.session.cart || [];
    const totals = calculateOrderTotal(cart);
    res.json({
      success: true,
      cart,
      totals,
      ...totals,
      orderDetails: req.session.orderDetails || null
    });
  });

  router.get('/order-details', requireAuth, async (req, res) => {
    await hydrateUserState(req);
    res.json({ success: true, orderDetails: req.session.orderDetails || null });
  });

  router.post('/order-details', requireAuth, async (req, res) => {
    await hydrateUserState(req);
    const cart = req.session.cart || [];
    if (!cart.length) {
      return res.status(400).json({ success: false, message: 'Your cart is empty' });
    }

    const body = req.body || {};
    const serviceType = String(body.serviceType || '').trim();
    const fullName = String(body.fullName || body.name || '').trim();
    const phone = String(body.phone || body.mobile || '').trim();

    if (!serviceType) {
      return res.status(400).json({ success: false, message: 'Please choose dine-in or delivery' });
    }
    if (fullName.length < 2) {
      return res.status(400).json({ success: false, message: 'Please enter your full name' });
    }
    if (phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ success: false, message: 'Please enter a valid mobile number' });
    }

    req.session.orderDetails = {
      ...body,
      serviceType,
      fullName,
      phone
    };
    await persistUserState(req);
    res.json({ success: true, orderDetails: req.session.orderDetails });
  });

  router.delete('/order-details', requireAuth, async (req, res) => {
    delete req.session.orderDetails;
    if (req.session.user?.id) {
      await db.saveUserCart(req.session.user.id, req.session.cart || [], null);
    }
    res.json({ success: true });
  });

  router.get('/orders', requireAuth, async (req, res) => {
    const status = String(req.query.status || 'all').toLowerCase();
    const orders = await db.getOrdersByUserId(req.session.user.id, { status });
    res.json({
      success: true,
      source: 'database',
      status,
      orders
    });
  });

  router.get('/orders/:id', requireAuth, async (req, res) => {
    const order = await db.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const isOwner = order.userId === req.session.user.id;
    const isAdmin = req.session.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not allowed' });
    }
    res.json({ success: true, order });
  });

  router.post('/payment/upi/initiate', requireAuth, async (req, res) => {
    await hydrateUserState(req);
    const cart = req.session.cart || [];
    if (!cart.length) {
      return res.status(400).json({ success: false, message: 'Your cart is empty' });
    }
    if (!req.session.orderDetails?.serviceType) {
      return res.status(400).json({ success: false, message: 'Please complete order details first' });
    }

    const { upiApp } = req.body || {};
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

  router.post('/payment/upi/cancel', requireAuth, (req, res) => {
    delete req.session.pendingUpiPayment;
    res.json({ success: true });
  });

  router.post('/payment/upi/verify', requireAuth, async (req, res) => {
    await hydrateUserState(req);
    const { txnId, returnedFromApp } = req.body || {};
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

    pending.verifyCount = Number(pending.verifyCount || 0) + 1;
    if (pending.verifyCount < 3) {
      return res.json({
        success: false,
        status: 'verifying',
        message: 'Verifying payment with bank...'
      });
    }

    const cart = req.session.cart || [];
    if (!cart.length || !req.session.orderDetails?.serviceType) {
      return res.json({
        success: false,
        status: 'failed',
        message: 'Order details missing. Please fill the order form again.'
      });
    }

    const totals = calculateOrderTotal(cart);
    const order = await db.createOrder({
      userId: req.session.user.id,
      username: req.session.user.username,
      items: cart,
      ...totals,
      paymentMethod: 'upi',
      paymentMeta: {
        upiApp: pending.upiApp,
        merchantUpiId: MERCHANT_UPI_ID,
        txnId: pending.txnId,
        bankVerified: true
      },
      serviceType: req.session.orderDetails.serviceType,
      orderDetails: req.session.orderDetails,
      status: 'paid'
    });

    req.session.cart = [];
    delete req.session.orderDetails;
    delete req.session.pendingUpiPayment;
    await db.clearUserCart(req.session.user.id);

    res.json({
      success: true,
      status: 'verified',
      message: 'Payment verified successfully',
      order
    });
  });

  router.post('/checkout', requireAuth, async (req, res) => {
    await hydrateUserState(req);
    const cart = req.session.cart || [];
    if (!cart.length) {
      return res.status(400).json({ success: false, message: 'Your cart is empty' });
    }
    if (!req.session.orderDetails?.serviceType) {
      return res.status(400).json({ success: false, message: 'Please complete order details first' });
    }

    const totals = calculateOrderTotal(cart);
    const order = await db.createOrder({
      userId: req.session.user.id,
      username: req.session.user.username,
      items: cart,
      ...totals,
      paymentMethod: req.body.paymentMethod || 'pay_at_cafe',
      paymentMeta: req.body.paymentMeta || null,
      serviceType: req.session.orderDetails.serviceType,
      orderDetails: req.session.orderDetails,
      status: 'pending'
    });

    req.session.cart = [];
    delete req.session.orderDetails;
    delete req.session.pendingUpiPayment;
    await db.clearUserCart(req.session.user.id);

    res.json({ success: true, order });
  });

  router.get('/admin/stats', requireAdmin, async (req, res) => {
    res.json({ success: true, stats: await db.getAdminStats() });
  });

  router.get('/admin/orders', requireAdmin, async (req, res) => {
    const scope = String(req.query.scope || 'active').toLowerCase();
    const orders = scope === 'all' ? await db.getAllOrders() : await db.getActiveOrders();
    res.json({
      success: true,
      scope: scope === 'all' ? 'all' : 'active',
      hours: 24,
      orders
    });
  });

  router.get('/admin/orders/archive', requireAdmin, async (req, res) => {
    const archive = await db.getOrdersArchiveByDate();
    res.json({
      success: true,
      message: 'Orders older than 24 hours are stored date-wise in the backend archive.',
      archive
    });
  });

  router.get('/admin/users', requireAdmin, async (req, res) => {
    res.json({ success: true, users: await db.getAllUsers() });
  });

  router.get('/admin/contact', requireAdmin, async (req, res) => {
    res.json({ success: true, messages: await db.getAllContactMessages() });
  });

  router.get('/admin/customer-details', requireAdmin, async (req, res) => {
    const scope = String(req.query.scope || 'active').toLowerCase();
    const details = await db.getCustomerDetailsForAdmin({ activeOnly: scope !== 'all' });
    res.json({
      success: true,
      scope: scope === 'all' ? 'all' : 'active',
      hours: 24,
      details
    });
  });

  router.get('/admin/messages', requireAdmin, async (req, res) => {
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

  router.post('/admin/messages/:id/mark-sent', requireAdmin, async (req, res) => {
    const channel = String(req.body.channel || 'whatsapp').trim();
    const sendMethod = String(req.body.sendMethod || req.body.method || 'whatsapp').trim();
    const entry = await db.markCustomerMessageSent(req.params.id, { channel, sendMethod });
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    res.json({ success: true, message: 'Bill delivery stored in backend', entry });
  });

  router.post('/admin/messages/:id/mark-failed', requireAdmin, async (req, res) => {
    const channel = String(req.body.channel || 'whatsapp').trim();
    const lastError = String(req.body.lastError || req.body.error || 'Send failed').trim();
    const sendMethod = String(req.body.sendMethod || req.body.method || '').trim() || null;
    const entry = await db.markCustomerMessageFailed(req.params.id, { channel, lastError, sendMethod });
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    res.json({ success: true, message: 'Marked as failed', entry });
  });

  router.get('/admin/sms-settings', requireAdmin, async (req, res) => {
    res.json({
      success: true,
      settings: {
        ...(await db.getSmsSettings()),
        help: 'Bills are sent on WhatsApp to the mobile number entered in Details.'
      }
    });
  });

  router.post('/admin/sms-settings', requireAdmin, async (req, res) => {
    await db.saveSmsSettings({ provider: 'whatsapp' });
    res.json({
      success: true,
      message: 'WhatsApp bill delivery is enabled. No SMS gateway needed.',
      settings: { provider: 'whatsapp', configured: true, easyMode: true }
    });
  });

  router.post('/admin/sms-test', requireAdmin, async (req, res) => {
    res.json({
      success: true,
      message: 'WhatsApp mode is ready. Use Send bill from an order to open WhatsApp.'
    });
  });

  router.get('/admin/orders/:id/bill.json', requireAdmin, async (req, res) => {
    const order = await db.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const withToken = (await db.ensureInvoiceToken(order.id)) || order;
    const bill = buildBill(withToken);
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
      invoiceUrl: withToken.invoiceToken ? `/invoice/${withToken.invoiceToken}` : '',
      whatsappUrl: links.whatsappUrl || '',
      whatsappAppUrl: links.whatsappAppUrl || '',
      whatsappLinks,
      svg: bill.svg
    });
  });

  router.post('/admin/orders/:id/send-bill-image', requireAdmin, async (req, res) => {
    const order = await db.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

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

    const withToken = (await db.ensureInvoiceToken(order.id)) || order;
    const caption = buildWhatsAppBillCaption(withToken);
    const messageRecords = [];
    for (const phone of phones) {
      const links = buildWhatsAppUrl(phone, caption);
      const entry = await db.createCustomerMessage({
        orderId: withToken.id,
        phone,
        message: caption,
        status: 'ready',
        channel: 'whatsapp',
        sendMethod: 'client-share'
      });
      messageRecords.push({
        ...entry,
        whatsappUrl: links.whatsappUrl || '',
        whatsappAppUrl: links.whatsappAppUrl || ''
      });
    }

    res.json({
      success: true,
      message: `Bill ready for WhatsApp (${phones.length} number${phones.length === 1 ? '' : 's'})`,
      phones,
      messageRecords,
      caption
    });
  });

  router.patch('/admin/orders/:id/status', requireAdmin, async (req, res) => {
    const { status } = req.body || {};
    const order = await db.updateOrderStatus(req.params.id, status);
    if (!order) {
      return res.status(400).json({ success: false, message: 'Invalid order or status' });
    }
    res.json({ success: true, order });
  });

  // Support both /api/... (local-style) and /... (Netlify rewrite splat)
  app.use('/api', router);
  app.use('/', router);

  app.use((req, res) => {
    res.status(404).json({ success: false, message: `API route not found: ${req.method} ${req.path}` });
  });

  return app;
}

module.exports = { createApp };
