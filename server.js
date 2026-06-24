const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;
const USERS_FILE = path.join(__dirname, 'users.json');

const DEFAULT_USERS = [
  { username: 'admin', password: 'admin123' },
  { username: 'user', password: 'password' }
];

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(data) && data.length) return data;
    }
  } catch (err) {
    console.error('Could not load users.json:', err.message);
  }
  return DEFAULT_USERS.map((user) => ({ ...user }));
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2));
}

let USERS = loadUsers();

const MERCHANT_UPI_ID = 'naveen7122004-1@okaxis';
const PLATFORM_FEE = 5;

function calculateOrderTotal(cart) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const coupon = subtotal > 10 ? 2 : 0;
  const total = subtotal + PLATFORM_FEE - coupon;
  return { subtotal, coupon, platformFee: PLATFORM_FEE, total };
}

function completeOrder(req, paymentMeta = {}) {
  const cart = req.session.cart || [];
  const { total } = calculateOrderTotal(cart);
  const order = {
    id: Date.now(),
    items: [...cart],
    total,
    ...paymentMeta,
    placedAt: new Date().toISOString()
  };

  req.session.cart = [];
  req.session.lastOrder = order;
  delete req.session.pendingUpiPayment;

  return order;
}

app.use(express.json());
app.use(
  session({
    secret: 'castle-cafe-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
  })
);
app.use(express.static(__dirname));

function findUser(username, password) {
  const u = String(username || '').trim().toLowerCase();
  const p = String(password || '').trim().toLowerCase();
  return USERS.find(
    (user) => user.username.toLowerCase() === u && user.password.toLowerCase() === p
  );
}

function findUserByUsername(username) {
  const u = String(username || '').trim().toLowerCase();
  return USERS.find((user) => user.username.toLowerCase() === u);
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Please log in first' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = findUser(username, password);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid username or password' });
  }

  req.session.user = { username: user.username };
  req.session.cart = req.session.cart || [];
  res.json({ success: true, user: { username: user.username } });
});

app.post('/api/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  if (username.length < 3) {
    return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
  }

  if (password.length < 4) {
    return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
  }

  if (findUserByUsername(username)) {
    return res.status(409).json({ success: false, message: 'Username already exists' });
  }

  const newUser = { username, password };
  USERS.push(newUser);
  saveUsers();

  req.session.user = { username: newUser.username };
  req.session.cart = req.session.cart || [];
  res.json({ success: true, user: { username: newUser.username } });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/check', (req, res) => {
  const cart = req.session.cart || [];
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user, cartCount });
  } else {
    res.json({ loggedIn: false, cartCount: 0 });
  }
});

app.get('/api/cart', requireAuth, (req, res) => {
  res.json({ cart: req.session.cart || [] });
});

app.post('/api/cart/add', requireAuth, (req, res) => {
  const { name, price, quantity } = req.body;

  if (!name || price == null || !quantity) {
    return res.status(400).json({ success: false, message: 'Missing item details' });
  }

  req.session.cart = req.session.cart || [];
  const existing = req.session.cart.find((item) => item.name === name);

  if (existing) {
    existing.quantity += Number(quantity);
  } else {
    req.session.cart.push({
      name,
      price: parseFloat(price),
      quantity: Number(quantity)
    });
  }

  res.json({ success: true, cart: req.session.cart });
});

app.delete('/api/cart/clear', requireAuth, (req, res) => {
  req.session.cart = [];
  res.json({ success: true });
});

app.post('/api/payment/upi/initiate', requireAuth, (req, res) => {
  const cart = req.session.cart || [];

  if (cart.length === 0) {
    return res.status(400).json({ success: false, message: 'Your cart is empty' });
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

app.post('/api/payment/upi/verify', requireAuth, (req, res) => {
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

  const order = completeOrder(req, {
    paymentMethod: 'upi',
    upiApp: pending.upiApp,
    merchantUpiId: MERCHANT_UPI_ID,
    txnId: pending.txnId,
    bankVerified: true
  });

  res.json({
    success: true,
    status: 'verified',
    message: 'Payment verified successfully',
    order
  });
});

app.post('/api/checkout', requireAuth, (req, res) => {
  const cart = req.session.cart || [];

  if (cart.length === 0) {
    return res.status(400).json({ success: false, message: 'Your cart is empty' });
  }

  const { paymentMethod, upiApp } = req.body;
  const order = completeOrder(req, {
    paymentMethod: paymentMethod || 'card',
    upiApp: upiApp || null,
    merchantUpiId: paymentMethod === 'upi' ? MERCHANT_UPI_ID : null
  });

  res.json({ success: true, order });
});

app.listen(PORT, () => {
  console.log(`Castle Cafe running at http://localhost:${PORT}`);
});
