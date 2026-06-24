const API = '/api';
const MERCHANT_UPI_ID = 'naveen7122004-1@okaxis';
const MERCHANT_NAME = 'Castle Cafe';

let paymentCartTotal = 0;
let selectedUpiApp = null;
let paymentInProgress = false;
let paymentReturnedFromApp = false;
let activeTxnId = null;
let verifyPollTimer = null;
let returnListenersAttached = false;

async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(`${API}${url}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    return await res.json();
  } catch {
    return { success: false, message: 'Could not connect to server. Run npm start and open http://localhost:8080' };
  }
}

async function login() {
  clearAuthError('loginError');

  const username = document.getElementById('username')?.value;
  const password = document.getElementById('password')?.value;
  const errorEl = document.getElementById('loginError');

  const data = await apiFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  if (data.success) {
    window.location.href = 'menu.html';
    return;
  }

  showAuthError('loginError', data.message || 'Invalid username or password', errorEl);
}

function showAuthError(id, message, errorEl = document.getElementById(id)) {
  if (errorEl) {
    errorEl.textContent = message;
    return;
  }
  alert(message);
}

function clearAuthError(id) {
  const errorEl = document.getElementById(id);
  if (!errorEl) return;
  errorEl.textContent = '';
}

function setupAuthForms() {
  clearAuthError('loginError');
  clearAuthError('registerError');

  const fields = [
    { inputId: 'username', errorId: 'loginError' },
    { inputId: 'password', errorId: 'loginError' },
    { inputId: 'regUsername', errorId: 'registerError' },
    { inputId: 'regPassword', errorId: 'registerError' },
    { inputId: 'regConfirmPassword', errorId: 'registerError' }
  ];

  fields.forEach(({ inputId, errorId }) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', () => clearAuthError(errorId));
    input.addEventListener('focus', () => clearAuthError(errorId));
  });
}

function forgotPassword() {
  alert('Contact us at castle@cafe.com to reset your password.');
}

async function register() {
  clearAuthError('registerError');

  const username = document.getElementById('regUsername')?.value;
  const password = document.getElementById('regPassword')?.value;
  const confirmPassword = document.getElementById('regConfirmPassword')?.value;
  const errorEl = document.getElementById('registerError');

  if (password !== confirmPassword) {
    showAuthError('registerError', 'Passwords do not match', errorEl);
    return;
  }

  const data = await apiFetch('/register', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  if (data.success) {
    window.location.href = 'menu.html';
    return;
  }

  showAuthError('registerError', data.message || 'Could not create account', errorEl);
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input || !btn) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.classList.toggle('visible', show);
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
}

async function logout() {
  await apiFetch('/logout', { method: 'POST' });
  window.location.href = 'index.html';
}

function toggleCart() {
  const cart = document.getElementById('menuCart');
  if (!cart) return;

  cart.classList.toggle('open');
  if (cart.classList.contains('open')) {
    loadCart();
  }
}

async function addToCart(name, price, quantity) {
  if (!price || price <= 0) {
    alert(`Price not set yet for "${name}". Please ask the cafe owner to add pricing.`);
    return;
  }

  const data = await apiFetch('/cart/add', {
    method: 'POST',
    body: JSON.stringify({ name, price, quantity })
  });

  if (!data.success) {
    if (data.message === 'Please log in first') {
      window.location.href = 'index.html';
      return;
    }
    alert(data.message || 'Could not add to cart');
    return;
  }

  updateCartBadge(data.cart);
  renderCart(data.cart);
}

async function confirmOrder() {
  const data = await apiFetch('/cart');
  if (!data.cart || data.cart.length === 0) {
    alert('Your cart is empty. Add items before confirming.');
    return;
  }
  window.location.href = 'payment.html';
}

function renderCart(cart) {
  const list = document.getElementById('orderList');
  const emptyMsg = document.getElementById('emptyMsg');
  const totalEl = document.getElementById('cartTotal');
  const confirmBtn = document.getElementById('confirmOrderBtn');

  if (!list) return;

  list.innerHTML = '';

  if (!cart || cart.length === 0) {
    if (emptyMsg) {
      emptyMsg.textContent = 'Your cart is empty';
      emptyMsg.style.display = 'block';
    }
    if (totalEl) totalEl.innerHTML = '';
    if (confirmBtn) confirmBtn.style.display = 'none';
    updateCartBadge([]);
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';
  if (confirmBtn) confirmBtn.style.display = 'block';

  cart.forEach((item) => {
    const lineTotal = item.price * item.quantity;

    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.name}</strong><br>${formatRupee(item.price)} × ${item.quantity} = ${formatRupee(lineTotal)}`;
    list.appendChild(li);
  });

  if (totalEl) totalEl.innerHTML = buildTotalSummaryHtml(calculateOrderTotals(cart));
  updateCartBadge(cart);
}

const PLATFORM_FEE = 5;

function calculateOrderTotals(cart) {
  const subtotal = (cart || []).reduce((sum, item) => sum + item.price * item.quantity, 0);
  const coupon = subtotal > 10 ? 2 : 0;
  const platformFee = PLATFORM_FEE;
  const total = subtotal + platformFee - coupon;
  return { subtotal, coupon, platformFee, total };
}

function buildTotalSummaryHtml(totals) {
  const couponLine = totals.coupon
    ? `<div class="cart-line cart-discount"><span>Coupon</span><span>-${formatRupee(totals.coupon)}</span></div>`
    : '';

  return `
    <div class="cart-line"><span>Subtotal</span><span>${formatRupee(totals.subtotal)}</span></div>
    <div class="cart-line"><span>Platform Fee</span><span>${formatRupee(totals.platformFee)}</span></div>
    ${couponLine}
    <div class="cart-line cart-line-total"><span>Total</span><span>${formatRupee(totals.total)}</span></div>
  `;
}

function formatRupee(amount) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPriceLabel(price) {
  return price > 0 ? formatRupee(price) : 'Price TBD';
}

function renderMenuItems() {
  const container = document.getElementById('menuItems');
  if (!container || typeof MENU_ITEMS === 'undefined') return;

  container.innerHTML = '';

  MENU_ITEMS.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.dataset.name = item.name;
    card.dataset.price = String(item.price);

    card.innerHTML = `
      <h3 class="menu-dish-name">${item.name}</h3>
      <img src="${item.image}" alt="${item.name}" loading="lazy">
      <p class="menu-dish-price">${formatPriceLabel(item.price)}</p>
      <div class="qty">
        <button class="minus" type="button">-</button>
        <span class="count">1</span>
        <button class="plus" type="button">+</button>
      </div>
      <button class="order-btn" type="button">Add to Cart</button>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll('.menu-card').forEach((card) => {
    const name = card.dataset.name;
    const price = parseFloat(card.dataset.price);
    setupQtyControls(card, (qty) => addToCart(name, price, qty));
  });
}

function toggleSection(id) {
  const section = document.getElementById(id);
  if (section) section.classList.toggle('collapsed');
}

function renderOrderSummary(cart) {
  const listEl = document.getElementById('summaryList');
  if (!listEl) return 0;

  listEl.innerHTML = '';

  cart.forEach((item) => {
    const lineTotal = item.price * item.quantity;

    const li = document.createElement('li');
    li.innerHTML = `<span>${item.name} × ${item.quantity}</span><span>${formatRupee(lineTotal)}</span>`;
    listEl.appendChild(li);
  });

  const totals = calculateOrderTotals(cart);

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('priceSubtotal', formatRupee(totals.subtotal));
  set('priceFee', formatRupee(totals.platformFee));
  set('priceCoupon', totals.coupon ? `-${formatRupee(totals.coupon)}` : '-₹0');

  const couponRow = document.getElementById('couponRow');
  if (couponRow) couponRow.style.display = totals.coupon ? 'flex' : 'none';

  set('summaryTotal', formatRupee(totals.total));
  set('upiAmountDisplay', formatRupee(totals.total));
  set('codAmountDisplay', formatRupee(totals.total));

  return totals.total;
}

async function loadPaymentPage() {
  const listEl = document.getElementById('summaryList');
  if (!listEl) return;

  const auth = await apiFetch('/auth/check');
  if (!auth.loggedIn) {
    window.location.href = 'index.html';
    return;
  }

  const data = await apiFetch('/cart');
  const cart = data.cart || [];

  if (cart.length === 0) {
    window.location.href = 'menu.html';
    return;
  }

  paymentCartTotal = renderOrderSummary(cart);
  setupPaymentMethods();
  updateUpiPayButton();
}

function buildUpiPayUrl(amount, txnId) {
  const params = new URLSearchParams({
    pa: MERCHANT_UPI_ID,
    pn: MERCHANT_NAME,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: 'Castle Cafe Order'
  });
  if (txnId) params.set('tr', txnId);
  return `upi://pay?${params.toString()}`;
}

function getUpiAppLink(app, amount, txnId) {
  const query = new URLSearchParams({
    pa: MERCHANT_UPI_ID,
    pn: MERCHANT_NAME,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: txnId ? `Castle Cafe ${txnId}` : 'Castle Cafe Order'
  });
  if (txnId) query.set('tr', txnId);

  const queryStr = query.toString();
  const links = {
    'Google Pay': `tez://upi/pay?${queryStr}`,
    PhonePe: `phonepe://pay?${queryStr}`,
    Paytm: `paytmmp://pay?${queryStr}`,
    BHIM: `bhim://pay?${queryStr}`
  };

  return links[app] || buildUpiPayUrl(amount, txnId);
}

function openUpiApp(amount, txnId) {
  const payAmount = amount ?? paymentCartTotal;
  const link = getUpiAppLink(selectedUpiApp, payAmount, txnId);
  const anchor = document.createElement('a');
  anchor.href = link;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.location.href = link;
}

function showPaymentOverlay(mode, title, message, amount) {
  const overlay = document.getElementById('paymentOverlay');
  const spinner = document.getElementById('paySpinner');
  const successIcon = document.getElementById('paySuccessIcon');
  const titleEl = document.getElementById('payOverlayTitle');
  const messageEl = document.getElementById('payOverlayMessage');
  const amountEl = document.getElementById('payOverlayAmount');
  const retryBtn = document.getElementById('payRetryBtn');
  const cancelBtn = document.getElementById('payCancelBtn');

  if (!overlay) return;

  overlay.classList.remove('hidden');
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;

  if (amountEl) {
    if (amount != null) {
      amountEl.textContent = formatRupee(amount);
      amountEl.classList.remove('hidden');
    } else {
      amountEl.classList.add('hidden');
    }
  }

  const isSuccess = mode === 'success';
  const isFailed = mode === 'failed';
  const showCancel = paymentInProgress && ['opening', 'upi-open', 'verifying'].includes(mode);

  if (spinner) spinner.classList.toggle('hidden', isSuccess || isFailed);
  if (successIcon) successIcon.classList.toggle('hidden', !isSuccess);
  if (retryBtn) retryBtn.classList.toggle('hidden', !isFailed);
  if (cancelBtn) cancelBtn.classList.toggle('hidden', !showCancel);
}

function hidePaymentOverlay() {
  const overlay = document.getElementById('paymentOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function stopVerifyPolling() {
  if (verifyPollTimer) {
    clearInterval(verifyPollTimer);
    verifyPollTimer = null;
  }
}

function handlePaymentReturn() {
  if (!paymentInProgress || document.visibilityState !== 'visible') return;
  paymentReturnedFromApp = true;
  if (activeTxnId) pollUpiVerification(activeTxnId);
}

function attachReturnListeners() {
  if (returnListenersAttached) return;
  returnListenersAttached = true;
  document.addEventListener('visibilitychange', handlePaymentReturn);
  window.addEventListener('focus', handlePaymentReturn);
  window.addEventListener('pageshow', handlePaymentReturn);
}

async function runUpiVerify(txnId) {
  const data = await apiFetch('/payment/upi/verify', {
    method: 'POST',
    body: JSON.stringify({ txnId, returnedFromApp: paymentReturnedFromApp })
  });

  if (data.status === 'verified' && data.success) {
    stopVerifyPolling();
    paymentInProgress = false;
    finishPaymentSuccess(data.order);
    return;
  }

  if (data.status === 'failed') {
    stopVerifyPolling();
    paymentInProgress = false;
    showPaymentOverlay('failed', 'Payment Failed', data.message || 'Could not verify payment.');
    return;
  }

  if (data.status === 'verifying') {
    showPaymentOverlay('verifying', 'Verifying Payment', data.message || 'Checking payment with your bank...');
  } else if (data.status === 'waiting') {
    showPaymentOverlay('upi-open', 'UPI App Open', data.message || 'Complete payment in your UPI app.');
  }
}

async function pollUpiVerification(txnId) {
  if (verifyPollTimer) return;

  showPaymentOverlay('verifying', 'Verifying Payment', 'Checking payment status with your bank...');
  await runUpiVerify(txnId);
  verifyPollTimer = setInterval(() => runUpiVerify(txnId), 2000);
}

function finishPaymentSuccess(order, { isCod = false } = {}) {
  hidePayButtons();
  updateCartBadgeFromCount(0);

  const card = document.getElementById('paymentOverlayCard');
  if (card) card.classList.add('success-pop');

  showPaymentOverlay(
    'success',
    isCod ? 'Order Successful!' : 'Payment Successful!',
    isCod
      ? `Order #${order.id} placed. Pay ${formatRupee(order.total)} in cash on delivery.`
      : `Order #${order.id} confirmed. Bank payment verified.`,
    order.total
  );

  const messageEl = document.getElementById('paymentMessage');
  if (messageEl) {
    messageEl.textContent = isCod
      ? `Order placed successfully! Pay ${formatRupee(order.total)} when your order is delivered.`
      : `Payment of ${formatRupee(order.total)} verified successfully!`;
    messageEl.className = 'payment-message success';
  }

  setTimeout(() => {
    hidePaymentOverlay();
    window.location.href = 'menu.html';
  }, 3500);
}

function selectUpiApp(app) {
  selectedUpiApp = app;
  document.querySelectorAll('.fk-upi-circle').forEach((btn) => {
    btn.classList.toggle('selected', btn.title === app);
  });
  updateUpiPayButton();
}

function updateUpiPayButton() {
  const payBtn = document.querySelector('.fk-pay-btn-upi');
  if (!payBtn) return;
  payBtn.disabled = !selectedUpiApp;
  payBtn.textContent = 'Pay';
}

async function confirmUpiPayment() {
  if (paymentInProgress) return;

  if (!selectedUpiApp) {
    alert('Please select a UPI app (Google Pay, PhonePe, Paytm, or BHIM) first.');
    return;
  }

  const messageEl = document.getElementById('paymentMessage');
  if (messageEl) {
    messageEl.textContent = '';
    messageEl.className = 'payment-message';
  }

  paymentInProgress = true;
  paymentReturnedFromApp = false;
  activeTxnId = null;
  stopVerifyPolling();

  showPaymentOverlay('opening', 'Opening UPI', `Launching ${selectedUpiApp}...`, paymentCartTotal);
  attachReturnListeners();

  const init = await apiFetch('/payment/upi/initiate', {
    method: 'POST',
    body: JSON.stringify({ upiApp: selectedUpiApp })
  });

  if (!init.success) {
    paymentInProgress = false;
    showPaymentOverlay('failed', 'Payment Failed', init.message || 'Could not start payment.');
    if (messageEl) {
      messageEl.textContent = init.message || 'Could not start payment';
      messageEl.className = 'payment-message error';
    }
    return;
  }

  activeTxnId = init.txnId;

  setTimeout(() => {
    openUpiApp(init.amount, init.txnId);
    showPaymentOverlay(
      'upi-open',
      'UPI App Open',
      `Pay ${formatRupee(init.amount)} in ${selectedUpiApp}, then return here.`,
      init.amount
    );
  }, 600);
}

async function cancelUpiPayment() {
  stopVerifyPolling();

  if (activeTxnId) {
    await apiFetch('/payment/upi/cancel', { method: 'POST' });
  }

  const card = document.getElementById('paymentOverlayCard');
  if (card) card.classList.remove('success-pop');

  paymentInProgress = false;
  paymentReturnedFromApp = false;
  activeTxnId = null;
  hidePaymentOverlay();
}

async function retryUpiPayment() {
  await cancelUpiPayment();
  confirmUpiPayment();
}


function setupPaymentMethods() {
  const upiPanel = document.getElementById('upiPanel');
  const cardPanel = document.getElementById('cardPanel');
  const codPanel = document.getElementById('codPanel');
  const methods = document.querySelectorAll('.fk-method');
  const radios = document.querySelectorAll('input[name="payment"]');

  function updateDetails() {
    const selected = document.querySelector('input[name="payment"]:checked')?.value;
    if (upiPanel) upiPanel.classList.toggle('hidden', selected !== 'upi');
    if (cardPanel) cardPanel.classList.toggle('hidden', selected !== 'card');
    if (codPanel) codPanel.classList.toggle('hidden', selected !== 'cod');

    methods.forEach((m) => {
      m.classList.toggle('active', m.dataset.method === selected);
    });

    if (selected !== 'upi') {
      selectedUpiApp = null;
      document.querySelectorAll('.fk-upi-circle').forEach((btn) => btn.classList.remove('selected'));
    }
    updateUpiPayButton();
  }

  radios.forEach((radio) => radio.addEventListener('change', updateDetails));
  updateDetails();
}

function validatePayment(method) {
  if (method === 'card') {
    const number = document.getElementById('cardNumber')?.value.trim();
    const name = document.getElementById('cardName')?.value.trim();
    const expiry = document.getElementById('cardExpiry')?.value.trim();
    const cvv = document.getElementById('cardCvv')?.value.trim();
    if (!number || !name || !expiry || !cvv) {
      return 'Please fill in all card details.';
    }
  }

  return null;
}

async function processPayment() {
  const messageEl = document.getElementById('paymentMessage');
  const method = document.querySelector('input[name="payment"]:checked')?.value || 'card';
  const error = validatePayment(method);

  if (error) {
    if (messageEl) {
      messageEl.textContent = error;
      messageEl.className = 'payment-message error';
    }
    return;
  }

  const data = await apiFetch('/checkout', {
    method: 'POST',
    body: JSON.stringify({ paymentMethod: method })
  });

  if (!data.success) {
    if (messageEl) {
      messageEl.textContent = data.message || 'Payment failed';
      messageEl.className = 'payment-message error';
    }
    return;
  }

  if (method === 'cod') {
    finishPaymentSuccess(data.order, { isCod: true });
    return;
  }

  showPaymentOverlay(
    'verifying',
    'Processing Payment',
    'Verifying payment with bank...'
  );

  setTimeout(() => {
    finishPaymentSuccess(data.order);
  }, 2500);
}

function hidePayButtons() {
  document.querySelectorAll('.fk-pay-btn').forEach((btn) => {
    btn.style.display = 'none';
  });
}

async function loadCart() {
  const list = document.getElementById('orderList');
  if (!list) return;

  const auth = await apiFetch('/auth/check');
  if (!auth.loggedIn) {
    if (document.body.classList.contains('menu-page')) {
      renderCart([]);
      return;
    }
    window.location.href = 'index.html';
    return;
  }

  const data = await apiFetch('/cart');
  renderCart(data.cart || []);
}

async function clearOrders() {
  await apiFetch('/cart/clear', { method: 'DELETE' });
  renderCart([]);
}

function updateCartBadge(cart) {
  const count = Array.isArray(cart)
    ? cart.reduce((sum, item) => sum + item.quantity, 0)
    : 0;
  updateCartBadgeFromCount(count);
}

async function initNav() {
  const data = await apiFetch('/auth/check');
  const logoutBtn = document.getElementById('logoutBtn');

  if (logoutBtn) {
    logoutBtn.style.display = data.loggedIn ? 'inline-block' : 'none';
  }

  updateCartBadgeFromCount(data.cartCount || 0);
}

function updateCartBadgeFromCount(count) {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-block' : 'none';
}

function setupQtyControls(container, onAdd) {
        let value = 1;
  const count = container.querySelector('.count');

  container.querySelector('.plus').onclick = () => {
            if (value < 100) count.textContent = ++value;
        };

  container.querySelector('.minus').onclick = () => {
            if (value > 1) count.textContent = --value;
        };

  container.querySelector('.order-btn').onclick = () => onAdd(value);
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  renderMenuItems();
  loadPaymentPage();
  setupAuthForms();

  const loginForm = document.querySelector('.login-form');
  const isRegisterPage = document.getElementById('regUsername');
  const isLoginPage = document.getElementById('username');

  if (loginForm && (isLoginPage || isRegisterPage)) {
    loginForm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isRegisterPage) register();
        else login();
      }
        });
    }
});
