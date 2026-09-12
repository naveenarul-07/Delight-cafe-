const API = (() => {
  if (window.API_BASE) return window.API_BASE;
  const { protocol, hostname, port } = window.location;
  // Live Server / preview ports → talk to Express on 8080
  if (
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    port &&
    port !== '8080' &&
    port !== ''
  ) {
    return `${protocol}//${hostname}:8080/api`;
  }
  return '/api';
})();
let MERCHANT_UPI_ID = 'naveen7122004-1@okaxis';
let MERCHANT_NAME = 'Delight Cafe';

let paymentCartTotal = 0;
let selectedUpiApp = null;
let paymentInProgress = false;
let paymentReturnedFromApp = false;
let activeTxnId = null;
let verifyPollTimer = null;
let returnListenersAttached = false;
let serverOnline = true;

function showServerBanner(message, isError = true) {
  let banner = document.getElementById('serverStatusBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'serverStatusBanner';
    banner.className = 'server-status-banner';
    document.body.prepend(banner);
  }
  banner.className = `server-status-banner${isError ? ' error' : ' ok'}`;
  banner.textContent = message;
  banner.hidden = false;
}

function hideServerBanner() {
  const banner = document.getElementById('serverStatusBanner');
  if (banner) banner.hidden = true;
}

function handleUnauthorized(message) {
  const protectedPages = ['menu-page', 'orders-page', 'admin-page'];
  const isProtected = protectedPages.some((cls) => document.body.classList.contains(cls));
  if (isProtected) {
    sessionStorage.setItem('authRedirectMessage', message || 'Please log in to continue');
    window.location.href = 'index.html';
  }
}

function isNetlifyHost() {
  const host = String(window.location.hostname || '');
  return host.endsWith('netlify.app') || host.endsWith('netlify.com');
}

function apiOfflineMessage(status) {
  if (isNetlifyHost()) {
    if (status === 404) {
      return 'API not found. Redeploy on Netlify with Functions enabled (Clear cache and deploy).';
    }
    if (status === 500 || status === 502 || status === 504) {
      return 'API error. Check Netlify Function logs and confirm MONGODB_URI is configured.';
    }
    return 'Cannot reach API on Netlify. Confirm /api/* redirects to Functions, then redeploy.';
  }

  if (status === 404) {
    return 'API not found (404). Run npm start and open http://localhost:8080 (not a Live Server port).';
  }
  return 'Cannot reach server. Run npm start in the project folder, then open http://localhost:8080';
}

async function apiFetch(url, options = {}) {
  const { skipAuthRedirect = false, ...fetchOptions } = options;

  try {
    const res = await fetch(`${API}${url}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
      ...fetchOptions
    });

    let data = {};
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      data = await res.json();
    } else if (!res.ok) {
      data = { success: false, message: apiOfflineMessage(res.status) };
    }

    if (!res.ok && data.success !== false) {
      data.success = false;
      data.message = data.message || apiOfflineMessage(res.status);
    }

    // Prefer explicit API JSON message; never leave a bare "Request failed"
    if (!res.ok && (!data.message || data.message === 'API route not found')) {
      data.message = apiOfflineMessage(res.status);
    }

    data.ok = res.ok;
    data.status = res.status;

    if (res.status === 401 && !skipAuthRedirect) {
      handleUnauthorized(data.message);
    }

    if (res.ok) {
      serverOnline = true;
      hideServerBanner();
    }

    return data;
  } catch {
    serverOnline = false;
    const message = apiOfflineMessage();
    showServerBanner(message);
    return {
      success: false,
      ok: false,
      offline: true,
      message
    };
  }
}

async function checkServerHealth() {
  const health = await apiFetch('/health', { skipAuthRedirect: true });
  if (health.success) {
    serverOnline = true;
    hideServerBanner();
    return true;
  }
  return false;
}

async function loadAppConfig() {
  const config = await apiFetch('/config', { skipAuthRedirect: true });
  if (!config.success) return;

  MERCHANT_UPI_ID = config.merchantUpiId || MERCHANT_UPI_ID;
  MERCHANT_NAME = config.merchantName || MERCHANT_NAME;
}

async function redirectIfLoggedIn() {
  const isRegisterPage = Boolean(
    document.getElementById('registerPanel') ||
      document.getElementById('regPhone') ||
      document.getElementById('regEmail') ||
      document.getElementById('regUsername')
  );
  const isHomeLogin = document.body.classList.contains('home-page') && document.getElementById('username');

  // Register page: send signed-in users onward
  if (isRegisterPage) {
    const auth = await apiFetch('/auth/check', { skipAuthRedirect: true });
    if (auth.loggedIn) {
      window.location.href = auth.user?.role === 'admin' ? 'admin.html' : 'menu.html';
    }
    return;
  }

  // Home stays available after login — show welcome panel instead of bouncing away
  if (isHomeLogin) {
    const auth = await apiFetch('/auth/check', { skipAuthRedirect: true });
    if (auth.loggedIn) {
      showLoggedInHome(auth);
    } else {
      const msg = sessionStorage.getItem('authRedirectMessage');
      if (msg) {
        showAuthError('loginError', msg);
        sessionStorage.removeItem('authRedirectMessage');
      }
    }
  }
}

function showLoggedInHome(auth) {
  const user = auth.user || {};
  const isAdmin = user.role === 'admin';
  const loginPanel = document.getElementById('loginPanel');
  const ctaGroup = document.querySelector('.home-cta-group');
  const lead = document.querySelector('.home-lead');
  const kicker = document.querySelector('.home-kicker');

  if (kicker) kicker.textContent = isAdmin ? 'Admin signed in' : 'Welcome back';
  if (lead) {
    lead.textContent = isAdmin
      ? `Hi ${user.username} — manage orders from the dashboard, or browse the cafe as a guest would.`
      : `Hi ${user.username} — your table is ready whenever you are.`;
  }

  if (ctaGroup) {
    ctaGroup.innerHTML = isAdmin
      ? `
        <a class="btn-hero" href="admin.html">Open dashboard</a>
        <a class="btn-hero-ghost" href="menu.html">Browse menu</a>
        <a class="btn-hero-ghost" href="orders.html">My orders</a>
      `
      : `
        <a class="btn-hero" href="menu.html">Explore the menu</a>
        <a class="btn-hero-ghost" href="orders.html">My orders</a>
      `;
  }

  if (loginPanel) {
    loginPanel.innerHTML = `
      <p class="auth-eyebrow">${isAdmin ? 'Admin account' : 'Signed in'}</p>
      <h2>${user.username}</h2>
      <p class="home-signed-note">You can switch pages anytime from the top menu. Home stays available after login.</p>
      <div class="home-signed-actions">
        ${isAdmin ? '<a class="btn-hero" href="admin.html">Dashboard</a>' : ''}
        <a class="btn-hero" href="menu.html">Menu</a>
        <a class="btn-hero-ghost" href="orders.html">My Orders</a>
        <button type="button" class="btn-hero-ghost" id="homeLogoutBtn">Logout</button>
      </div>
    `;
    document.getElementById('homeLogoutBtn')?.addEventListener('click', () => logout());
  }
}

async function requireAuthPage() {
  const protectedPages = ['menu-page', 'orders-page', 'payment-page', 'checkout-page'];
  const needsAuth = protectedPages.some((cls) => document.body.classList.contains(cls));
  if (!needsAuth) return true;

  const auth = await apiFetch('/auth/check', { skipAuthRedirect: true });
  if (!auth.loggedIn) {
    sessionStorage.setItem('authRedirectMessage', 'Please log in to continue');
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

async function login() {
  clearAuthError('loginError');

  const identifier = document.getElementById('username')?.value.trim();
  const password = document.getElementById('password')?.value;
  const errorEl = document.getElementById('loginError');
  const loginBtn =
    document.getElementById('loginSubmitBtn') ||
    document.querySelector('.login-form button[type="submit"], .login-form button[onclick="login()"]');

  if (!identifier || !password) {
    showAuthError('loginError', 'Please enter your mobile number or email, and your password', errorEl);
    return;
  }

  if (loginBtn) loginBtn.disabled = true;

  const data = await apiFetch('/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, username: identifier, password }),
    skipAuthRedirect: true
  });

  if (loginBtn) loginBtn.disabled = false;

  if (data.success) {
    window.location.href = data.user?.role === 'admin' ? 'admin.html' : 'menu.html';
    return;
  }

  const msg =
    data.status === 404
      ? `Login API not found (404). Open http://localhost:8080 (not Live Server). Tried: ${API}/login`
      : data.message || 'Invalid mobile number / email or password';
  showAuthError('loginError', msg, errorEl);
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
    { inputId: 'regPhone', errorId: 'registerError' },
    { inputId: 'regEmail', errorId: 'registerError' },
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
  alert('Please contact Delight Cafe to reset your password.');
}

async function register() {
  clearAuthError('registerError');

  const phone = document.getElementById('regPhone')?.value.trim() || '';
  const email = document.getElementById('regEmail')?.value.trim() || '';
  const password = document.getElementById('regPassword')?.value || '';
  const confirmPassword = document.getElementById('regConfirmPassword')?.value || '';
  const errorEl = document.getElementById('registerError');

  if (!phone && !email) {
    showAuthError('registerError', 'Please provide a mobile number or email address', errorEl);
    return;
  }
  if (password.length < 6) {
    showAuthError('registerError', 'Password must be at least 6 characters', errorEl);
    return;
  }
  if (password !== confirmPassword) {
    showAuthError('registerError', 'Passwords do not match', errorEl);
    return;
  }

  const registerBtn =
    document.getElementById('registerSubmitBtn') ||
    document.querySelector('.login-form button[type="submit"], .login-form button[onclick="register()"]');
  if (registerBtn) registerBtn.disabled = true;

  const data = await apiFetch('/register', {
    method: 'POST',
    body: JSON.stringify({ phone, email, password, confirmPassword }),
    skipAuthRedirect: true
  });

  if (registerBtn) registerBtn.disabled = false;

  if (data.success) {
    window.location.href = 'index.html';
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

function toggleCart(forceOpen) {
  const cart = document.getElementById('menuCart');
  if (!cart) {
    window.location.href = 'menu.html#cart';
    return;
  }

  const shouldOpen =
    forceOpen === true ? true : forceOpen === false ? false : !cart.classList.contains('open');

  cart.classList.toggle('open', shouldOpen);
  document.body.classList.toggle('cart-open', shouldOpen);
  document.getElementById('navCartLink')?.classList.toggle('nav-active', shouldOpen);

  if (shouldOpen) {
    loadCart();
    if (!document.documentElement.classList.contains('mobile-view')) {
      cart.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

function openCartFromNav(event) {
  if (event) event.preventDefault();

  if (document.body.classList.contains('menu-page') && document.getElementById('menuCart')) {
    toggleCart(true);
    return;
  }

  window.location.href = 'menu.html#cart';
}

async function addToCart(name, price, quantity) {
  if (price == null || price < 0) {
    alert(`Price not set yet for "${name}". Please ask the cafe owner to add pricing.`);
    return;
  }

  const data = await apiFetch('/cart/add', {
    method: 'POST',
    body: JSON.stringify({ name, quantity })
  });

  if (!data.success) {
    if (data.status === 401) return;
    alert(data.message || 'Could not add to cart');
    return;
  }

  updateCartBadge(data.cart);
  renderCart(data.cart);
  const navCart = document.getElementById('navCartLink');
  if (navCart) {
    navCart.classList.add('cart-pulse');
    setTimeout(() => navCart.classList.remove('cart-pulse'), 700);
  }
}

async function confirmOrder() {
  const data = await apiFetch('/cart');
  if (!data.cart || data.cart.length === 0) {
    alert('Your cart is empty. Add items before confirming.');
    return;
  }
  window.location.href = 'checkout.html';
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
    li.className = 'cart-line-item';
    li.innerHTML = `
      <div class="cart-line-info">
        <strong>${item.name}</strong>
        <span>${formatRupee(item.price)} × ${item.quantity} = ${formatRupee(lineTotal)}</span>
      </div>
      <div class="cart-line-actions">
        <button type="button" class="cart-qty-btn" data-action="minus" data-name="${item.name}" aria-label="Decrease quantity">−</button>
        <span class="cart-qty-count">${item.quantity}</span>
        <button type="button" class="cart-qty-btn" data-action="plus" data-name="${item.name}" aria-label="Increase quantity">+</button>
        <button type="button" class="cart-remove-btn" data-name="${item.name}">Remove</button>
      </div>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('[data-action="minus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const current = cart.find((entry) => entry.name === name);
      if (!current) return;
      if (current.quantity <= 1) removeCartItem(name);
      else updateCartItem(name, current.quantity - 1);
    });
  });

  list.querySelectorAll('[data-action="plus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const current = cart.find((entry) => entry.name === name);
      if (!current || current.quantity >= 100) return;
      updateCartItem(name, current.quantity + 1);
    });
  });

  list.querySelectorAll('.cart-remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeCartItem(btn.dataset.name));
  });

  if (totalEl) totalEl.innerHTML = buildTotalSummaryHtml(calculateOrderTotals(cart));
  updateCartBadge(cart);
}

async function updateCartItem(name, quantity) {
  const data = await apiFetch('/cart/update', {
    method: 'PATCH',
    body: JSON.stringify({ name, quantity })
  });

  if (data.success) {
    renderCart(data.cart);
    return;
  }

  alert(data.message || 'Could not update cart');
}

async function removeCartItem(name) {
  const data = await apiFetch(`/cart/item/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  });

  if (data.success) {
    renderCart(data.cart);
    return;
  }

  alert(data.message || 'Could not remove item');
}

function calculateOrderTotals(cart) {
  const items = cart || [];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { subtotal, coupon: 0, platformFee: 0, total: subtotal };
}

function buildTotalSummaryHtml(totals) {
  return `
    <div class="cart-line"><span>Items total</span><span>${formatRupee(totals.subtotal)}</span></div>
    <div class="cart-line cart-line-total"><span>Total</span><span>${formatRupee(totals.total)}</span></div>
  `;
}

function formatRupee(amount) {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPriceLabel(price) {
  return price > 0 ? formatRupee(price) : 'Price TBD';
}

let menuItemsCache = [];
let menuCategoriesCache = [];
let activeMenuCategory = 'all';

const MENU_CATEGORY_STYLE = 'category';

function formatCategoryLabel(slug) {
  const cat = menuCategoriesCache.find((entry) => entry.slug === slug);
  return cat ? cat.label : slug;
}

function setActiveCategoryChip(slug, { scrollChip = false } = {}) {
  activeMenuCategory = slug;

  document.querySelectorAll('#menuFilters button.menu-cat-logo').forEach((btn) => {
    const isActive = btn.dataset.category === slug;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    if (isActive && scrollChip) {
      btn.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
    }
  });
}

function createCategoryLogoButton(label, slug, isActive, onClick, index = 0) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `menu-cat-logo menu-cat-logo--${MENU_CATEGORY_STYLE}${isActive ? ' active' : ''}`;
  btn.dataset.category = slug;
  btn.style.setProperty('--cat-index', String(index));
  btn.textContent = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  btn.addEventListener('click', onClick);
  return btn;
}

function createCategoryHeading(label) {
  const heading = document.createElement('h3');
  heading.className = `menu-category-title menu-cat-logo menu-cat-logo--${MENU_CATEGORY_STYLE}`;
  heading.textContent = label;
  return heading;
}

function showMenuCategory(slug, { allowScroll = false } = {}) {
  setActiveCategoryChip(slug, { scrollChip: true });

  const container = document.getElementById('menuItems');
  if (!container) return;

  container.dataset.active = slug;
  container.querySelectorAll('.menu-category-section').forEach((section) => {
    const match = slug === 'all' || section.dataset.category === slug;
    section.hidden = !match;
  });

  if (allowScroll && slug === 'all') {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function renderMenuFilters(categories) {
  const container = document.getElementById('menuFilters');
  if (!container) return;

  container.innerHTML = '';

  const track = document.createElement('div');
  track.className = 'menu-category-track';

  let catIndex = 0;

  track.appendChild(
    createCategoryLogoButton('All Menu', 'all', activeMenuCategory === 'all', () => {
      showMenuCategory('all', { allowScroll: true });
    }, catIndex++)
  );

  categories.forEach((category) => {
    if (!category.count) return;

    track.appendChild(
      createCategoryLogoButton(
        category.label,
        category.slug,
        activeMenuCategory === category.slug,
        () => {
          showMenuCategory(category.slug, { allowScroll: false });
        },
        catIndex++
      )
    );
  });

  container.appendChild(track);
}

function shouldShowFullMenuImage(item) {
  const category = String(item.category || '');
  return category === 'beverages' || category === 'fresh-juices';
}

function usesStandardMenuGrid(categorySlug) {
  return (
    categorySlug === 'burgers-and-sandwiches' ||
    categorySlug === 'coffee-and-tea'
  );
}

function createMenuCard(item, index = 0) {
  const card = document.createElement('div');
  card.className = 'menu-card';
  card.dataset.name = item.name;
  card.dataset.price = String(item.price);
  if (item.category) card.dataset.category = item.category;
  card.style.setProperty('--card-index', String(index));

  const imageSrc = String(item.image || '');
  const showFullImage = shouldShowFullMenuImage(item);
  const imgClass = showFullImage ? 'menu-card-img menu-card-img--full' : 'menu-card-img';
  if (showFullImage) card.classList.add('menu-card--full-image');

  const actionsHtml = `
    <p class="menu-dish-price">${formatPriceLabel(item.price)}</p>
    <div class="qty">
      <button class="minus" type="button">-</button>
      <span class="count">1</span>
      <button class="plus" type="button">+</button>
    </div>
    <button class="order-btn" type="button">Add to Cart</button>
  `;

  card.innerHTML = `
    <h3 class="menu-dish-name">${item.name}</h3>
    <div class="menu-card-media${showFullImage ? ' menu-card-media--full' : ''}">
      <img class="${imgClass}" src="${imageSrc}" alt="${item.name}" loading="eager" decoding="async">
    </div>
    ${showFullImage ? `<div class="menu-card-footer">${actionsHtml}</div>` : actionsHtml}
  `;

  return card;
}

function createMenuItemsGrid(items, categorySlug) {
  const grid = document.createElement('div');
  const isFullImageGrid =
    categorySlug === 'beverages' ||
    categorySlug === 'fresh-juices' ||
    (items.length > 0 && items.every((item) => shouldShowFullMenuImage(item)));
  const isStandardCards = usesStandardMenuGrid(categorySlug);
  grid.className = [
    'menu-items-grid',
    isFullImageGrid ? 'menu-items-grid--beverages menu-items-grid--full-images' : '',
    isStandardCards ? 'menu-items-grid--standard-cards' : ''
  ]
    .filter(Boolean)
    .join(' ');
  items.forEach((item, index) => grid.appendChild(createMenuCard(item, index)));
  return grid;
}

function bindMenuCardControls(container) {
  container.querySelectorAll('.menu-card').forEach((card) => {
    const name = card.dataset.name;
    const price = parseFloat(card.dataset.price);
    setupQtyControls(card, (qty) => addToCart(name, price, qty));
  });
}

function preloadMenuImages(items) {
  items.forEach((item) => {
    const src = String(item.image || '').split('?')[0];
    if (!src) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = item.image;
  });
}

function renderMenuItems(items) {
  const container = document.getElementById('menuItems');
  if (!container) return;

  container.innerHTML = '';
  container.dataset.active = activeMenuCategory;

  if (!items.length) {
    container.innerHTML = '<p class="empty-msg">No items in this category yet.</p>';
    return;
  }

  const grouped = new Map();
  items.forEach((item) => {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item);
  });

  const order = menuCategoriesCache.length
    ? menuCategoriesCache.map((cat) => cat.slug)
    : Array.from(grouped.keys());

  const fragment = document.createDocumentFragment();

  order.forEach((slug) => {
    const groupItems = grouped.get(slug);
    if (!groupItems?.length) return;

    const section = document.createElement('section');
    section.className = 'menu-category-section';
    section.dataset.category = slug;
    section.appendChild(createCategoryHeading(formatCategoryLabel(slug)));
    section.appendChild(createMenuItemsGrid(groupItems, slug));
    fragment.appendChild(section);
  });

  container.appendChild(fragment);
  bindMenuCardControls(container);
  preloadMenuImages(items);
  showMenuCategory(activeMenuCategory);
}

async function loadMenuItems() {
  const container = document.getElementById('menuItems');
  if (!container) return;

  container.innerHTML = '<p class="empty-msg">Loading menu...</p>';

  const online = await checkServerHealth();
  if (!online) {
    container.innerHTML = isNetlifyHost()
      ? '<p class="empty-msg">API offline on Netlify. Set MONGODB_URI and redeploy Functions.</p>'
      : '<p class="empty-msg">Server offline. Run <strong>npm start</strong> and open <strong>http://localhost:8080</strong> (not Live Server).</p>';
    return;
  }

  const [menuData, categoryData] = await Promise.all([
    apiFetch('/menu', { skipAuthRedirect: true }),
    apiFetch('/menu/categories', { skipAuthRedirect: true })
  ]);

  if (!menuData.success) {
    container.innerHTML = `<p class="empty-msg">${menuData.message || 'Could not load menu.'}</p>`;
    return;
  }

  menuItemsCache = menuData.items || [];
  menuCategoriesCache = categoryData.categories || [];
  renderMenuFilters(menuCategoriesCache);
  renderMenuItems(menuItemsCache);
}

async function submitContactForm(event) {
  event.preventDefault();

  const form = document.getElementById('contactForm');
  if (!form) return;

  const name = document.getElementById('contactName')?.value.trim();
  const email = document.getElementById('contactEmail')?.value.trim();
  const message = document.getElementById('contactMessage')?.value.trim();
  const statusEl = document.getElementById('contactStatus');
  const submitBtn = document.getElementById('contactSubmitBtn');

  if (submitBtn) submitBtn.disabled = true;

  const data = await apiFetch('/contact', {
    method: 'POST',
    body: JSON.stringify({ name, email, message })
  });

  if (submitBtn) submitBtn.disabled = false;

  if (!statusEl) return;

  statusEl.hidden = false;
  statusEl.className = `contact-status ${data.success ? 'success' : 'error'}`;
  statusEl.textContent = data.message || (data.success ? 'Message sent.' : 'Could not send message.');

  if (data.success) form.reset();
}

function setupContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', submitContactForm);
}

function toggleSection(id) {
  const section = document.getElementById(id);
  if (section) section.classList.toggle('collapsed');
}

function renderOrderSummary(cart) {
  const listEl = document.getElementById('summaryList');
  if (listEl) {
    listEl.innerHTML = '';
    (cart || []).forEach((item) => {
      const lineTotal = item.price * item.quantity;
      const li = document.createElement('li');
      li.innerHTML = `<span>${item.name} × ${item.quantity}</span><span>${formatRupee(lineTotal)}</span>`;
      listEl.appendChild(li);
    });
  }

  const totals = calculateOrderTotals(cart);
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('priceSubtotal', formatRupee(totals.subtotal));
  set('summaryTotal', formatRupee(totals.total));
  set('upiAmountDisplay', formatRupee(totals.total));
  set('codAmountDisplay', formatRupee(totals.total));

  return totals.total;
}

async function loadPaymentPage() {
  const listEl = document.getElementById('summaryList');
  if (!listEl) return;

  await loadAppConfig();

  const auth = await apiFetch('/auth/check');
  if (!auth.loggedIn) {
    window.location.href = 'index.html';
    return;
  }

  const data = await apiFetch('/cart/summary');
  const cart = data.cart || [];

  if (!data.success || cart.length === 0) {
    window.location.href = 'menu.html';
    return;
  }

  if (!data.orderDetails?.serviceType) {
    window.location.href = 'checkout.html';
    return;
  }

  paymentCartTotal = renderOrderSummary(cart);
  renderOrderDetailsSummary(data.orderDetails);
  setupPaymentMethods();
  updateUpiPayButton();
}

function formatServiceType(type) {
  return type === 'delivery' ? 'Delivery' : 'Dine-in';
}

function formatOrderDetailsBlock(details) {
  if (!details) return '';

  const lines = [
    `<strong>${formatServiceType(details.serviceType)}</strong>`,
    `${details.fullName} · ${
      Array.isArray(details.phones) && details.phones.length
        ? details.phones.map((p) => `+91 ${p}`).join(', ')
        : details.phone
    }`
  ];

  if (details.email) lines.push(details.email);

  if (details.serviceType === 'dining') {
    if (details.specialInstructions) lines.push(`Notes: ${details.specialInstructions}`);
  } else {
    if (details.addressLine) lines.push(details.addressLine);
    if (details.landmark) lines.push(`Landmark: ${details.landmark}`);
    if (details.city || details.pincode) {
      lines.push([details.city, details.pincode].filter(Boolean).join(' – '));
    }
    if (details.preferredTime) lines.push(`Preferred time: ${details.preferredTime}`);
    if (details.deliveryInstructions) lines.push(`Instructions: ${details.deliveryInstructions}`);
  }

  return lines.join('<br>');
}

function renderOrderDetailsSummary(details) {
  const el = document.getElementById('orderDetailsSummary');
  if (!el || !details) return;
  el.hidden = false;
  el.innerHTML = `${formatOrderDetailsBlock(details)}<p class="order-details-edit"><a href="checkout.html">Edit order details</a></p>`;
}

function toggleCheckoutSections(serviceType) {
  const deliverySection = document.getElementById('deliverySection');
  if (!deliverySection) return;

  const isDining = serviceType === 'dining';
  deliverySection.classList.toggle('hidden', isDining);

  document.getElementById('addressLine')?.toggleAttribute('required', !isDining);
  document.getElementById('city')?.toggleAttribute('required', !isDining);
  document.getElementById('pincode')?.toggleAttribute('required', !isDining);
}

function fillCheckoutForm(details) {
  if (!details) return;

  const serviceInput = document.querySelector(`input[name="serviceType"][value="${details.serviceType}"]`);
  if (serviceInput) serviceInput.checked = true;
  toggleCheckoutSections(details.serviceType);

  document.getElementById('fullName').value = details.fullName || '';
  const phoneValue =
    Array.isArray(details.phones) && details.phones.length
      ? details.phones.join(', ')
      : details.phone || '';
  document.getElementById('phone').value = phoneValue;
  document.getElementById('email').value = details.email || '';

  const notesEl = document.getElementById('orderNotes');
  if (notesEl) {
    notesEl.value =
      details.specialInstructions || details.deliveryInstructions || '';
  }

  if (details.serviceType === 'delivery') {
    const addressLine = document.getElementById('addressLine');
    const city = document.getElementById('city');
    const pincode = document.getElementById('pincode');
    if (addressLine) addressLine.value = details.addressLine || '';
    if (city) city.value = details.city || '';
    if (pincode) pincode.value = details.pincode || '';
  }
}

function collectCheckoutPhones(rawValue) {
  const parts = String(rawValue || '')
    .split(/[\s,;/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const phones = [];
  const seen = new Set();
  parts.forEach((part) => {
    let digits = part.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    else if (digits.length > 10) digits = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(digits) && !seen.has(digits)) {
      seen.add(digits);
      phones.push(digits);
    }
  });
  return phones;
}

function collectCheckoutForm() {
  const serviceType = document.querySelector('input[name="serviceType"]:checked')?.value || 'dining';
  const phones = collectCheckoutPhones(document.getElementById('phone')?.value || '');
  const phone = phones[0] || '';

  const payload = {
    serviceType,
    fullName: document.getElementById('fullName')?.value.trim(),
    phone,
    phones,
    email: document.getElementById('email')?.value.trim()
  };

  const notes = document.getElementById('orderNotes')?.value.trim() || '';
  if (serviceType === 'dining') {
    payload.orderNotes = notes;
  } else {
    payload.addressLine = document.getElementById('addressLine')?.value.trim();
    payload.city = document.getElementById('city')?.value.trim();
    payload.pincode = document.getElementById('pincode')?.value.trim();
    payload.orderNotes = notes;
  }

  return payload;
}

function setupDeclarationActions() {
  const declaration = document.getElementById('declaration');
  const submitBtn = document.getElementById('checkoutSubmitBtn');
  const actions = document.getElementById('checkoutActions');

  if (!declaration || !submitBtn) return;

  const syncSubmitState = () => {
    const accepted = declaration.checked;
    submitBtn.disabled = !accepted;
    if (actions) {
      actions.classList.toggle('checkout-actions-ready', accepted);
    }
  };

  declaration.addEventListener('change', syncSubmitState);
  syncSubmitState();
}

async function submitCheckoutForm(event) {
  event.preventDefault();

  const errorEl = document.getElementById('checkoutError');
  const submitBtn = document.getElementById('checkoutSubmitBtn');
  const declaration = document.getElementById('declaration');

  if (errorEl) errorEl.hidden = true;

  if (!declaration?.checked) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = 'Please accept the declaration to continue.';
    }
    return;
  }

  const payload = collectCheckoutForm();
  if (submitBtn) submitBtn.disabled = true;

  const data = await apiFetch('/order-details', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  if (submitBtn) submitBtn.disabled = false;

  if (data.success) {
    window.location.href = 'payment.html';
    return;
  }

  if (submitBtn) submitBtn.disabled = !declaration?.checked;

  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent = data.message || 'Could not save order details.';
  }
}

async function loadCheckoutPage() {
  const form = document.getElementById('orderDetailsForm');
  if (!form) return;

  const auth = await apiFetch('/auth/check');
  if (!auth.loggedIn) {
    window.location.href = 'index.html';
    return;
  }

  const cart = await apiFetch('/cart');
  if (!cart.cart?.length) {
    window.location.href = 'menu.html';
    return;
  }

  const saved = await apiFetch('/order-details');
  if (saved.orderDetails) {
    fillCheckoutForm(saved.orderDetails);
  } else {
    toggleCheckoutSections('dining');
  }

  document.querySelectorAll('input[name="serviceType"]').forEach((input) => {
    input.addEventListener('change', () => toggleCheckoutSections(input.value));
  });

  setupDeclarationActions();
  form.addEventListener('submit', submitCheckoutForm);
}

function buildUpiPayUrl(amount, txnId) {
  const params = new URLSearchParams({
    pa: MERCHANT_UPI_ID,
    pn: MERCHANT_NAME,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: 'Delight Cafe Order'
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
    tn: txnId ? `Delight Cafe ${txnId}` : 'Delight Cafe Order'
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
    finishPaymentSuccess(data.order, { notification: data.notification });
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

async function svgToPngBlob(svgText, scale = 2) {
  const widthMatch = String(svgText).match(/\bwidth="(\d+(?:\.\d+)?)"/);
  const heightMatch = String(svgText).match(/\bheight="(\d+(?:\.\d+)?)"/);
  const baseW = Math.max(1, Math.round(Number(widthMatch?.[1]) || 480));
  const baseH = Math.max(1, Math.round(Number(heightMatch?.[1]) || 700));

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load bill SVG'));
      img.src = src;
    });

  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  let img;
  try {
    img = await loadImage(dataUri);
  } catch (_) {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      img = await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(baseW * scale);
  canvas.height = Math.round(baseH * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef3f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create PNG'))), 'image/png');
  });
}

async function shareCheckoutBillImage(notification) {
  const phone = String(notification?.phone || '').replace(/\D/g, '').slice(-10);
  const svg = notification?.svg;
  if (!svg || phone.length !== 10) return false;

  try {
    const pngBlob = await svgToPngBlob(svg);
    const file = new File([pngBlob], `Delight-Cafe-Bill-${phone}.png`, { type: 'image/png' });
    const caption = notification.caption || notification.customerMessage || 'Delight Cafe Bill';

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Delight Cafe Bill', text: caption });
      return true;
    }

    if (window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    }

    const encoded = encodeURIComponent(
      `${caption}\n\n📷 Paste the bill image here (Ctrl+V), then Send.`
    );
    const appUrl = `whatsapp://send?phone=91${phone}&text=${encoded}`;
    const webUrl = `https://api.whatsapp.com/send?phone=91${phone}&text=${encoded}`;
    try {
      window.open(appUrl || webUrl, 'castleCafeWhatsApp');
    } catch (_) {
      window.open(webUrl, 'castleCafeWhatsApp');
    }
    return true;
  } catch (err) {
    console.warn('Checkout bill image share failed', err);
    return false;
  }
}

function finishPaymentSuccess(order, { isCod = false, notification = null } = {}) {
  paymentInProgress = false;
  hidePayButtons();
  updateCartBadgeFromCount(0);

  const card = document.getElementById('paymentOverlayCard');
  if (card) card.classList.add('success-pop');

  const phone = order?.orderDetails?.phone || notification?.phone || '';
  const smsText = notification?.customerMessage || '';
  const smsOk = notification?.success;

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
    let billNote = '';
    if (phone) {
      billNote = ` Your bill will be shared on WhatsApp to ${phone} from the cafe dashboard.`;
    }

    messageEl.textContent = isCod
      ? `Order placed successfully! Pay ${formatRupee(order.total)} when your order is delivered.${billNote}`
      : `Payment of ${formatRupee(order.total)} verified successfully!${billNote}`;
    messageEl.className = 'payment-message success';
  }

  if (smsText) {
    showCustomerMessagePanel(phone, smsText, false);
  }

  if (smsOk && phone) {
    showSentPopup(phone, {
      easy: true,
      whatsappUrl: null
    });
    // Do not auto-open WhatsApp here — admin sends the bill from Dashboard only.
  }

  setTimeout(() => {
    hidePaymentOverlay();
    window.location.href = 'orders.html';
  }, 5000);
}

function showSentPopup(phone = '', options = {}) {
  let popup = document.getElementById('smsSentPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'smsSentPopup';
    popup.className = 'sms-sent-popup';
    popup.innerHTML = `
      <div class="sms-sent-popup-card">
        <div class="sent-check">✓</div>
        <h3 id="smsSentPopupTitle">Sent</h3>
        <p id="smsSentPopupText"></p>
        <div id="smsSentPopupActions" class="sms-sent-actions" hidden></div>
      </div>
    `;
    popup.addEventListener('click', (e) => {
      if (e.target === popup) popup.classList.remove('show');
    });
    document.body.appendChild(popup);
  }

  const title = document.getElementById('smsSentPopupTitle');
  const text = document.getElementById('smsSentPopupText');
  const actions = document.getElementById('smsSentPopupActions');
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);

  if (title) title.textContent = 'Order Confirmed';
  if (text) {
    text.textContent = digits.length === 10
      ? `Order confirmed. Bill for +91 ${digits} will be sent from the cafe dashboard.`
      : 'Order confirmed. Your bill will be sent from the cafe dashboard.';
  }
  if (actions) {
    actions.hidden = true;
    actions.innerHTML = '';
  }

  popup.classList.add('show');
  clearTimeout(showSentPopup._timer);
  showSentPopup._timer = setTimeout(() => popup.classList.remove('show'), 2500);
}

function showCustomerMessagePanel(phone, message, delivered = false) {
  let panel = document.getElementById('customerMessagePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'customerMessagePanel';
    panel.className = 'customer-message-panel';
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="customer-message-card">
      <h3>${delivered ? 'SMS sent to' : 'Message for'} ${phone || 'your number'}</h3>
      <pre>${message}</pre>
    </div>
  `;
  panel.hidden = false;
}

function selectUpiApp(app) {
  selectedUpiApp = app || null;
  document.querySelectorAll('.fk-upi-circle').forEach((btn) => {
    const name = btn.dataset.upiApp || btn.title;
    btn.classList.toggle('selected', Boolean(selectedUpiApp) && name === selectedUpiApp);
  });
  updateUpiPayButton();
}

function updateUpiPayButton() {
  const payBtn = document.getElementById('upiPayBtn') || document.querySelector('.fk-pay-btn-upi');
  if (!payBtn) return;
  payBtn.disabled = !selectedUpiApp;
  payBtn.textContent = selectedUpiApp ? `Pay with ${selectedUpiApp}` : 'Select UPI app';
}

function clearPaymentMessage() {
  const messageEl = document.getElementById('paymentMessage');
  if (!messageEl) return;
  messageEl.textContent = '';
  messageEl.className = 'payment-message';
}

function setPaymentMessage(text, type = '') {
  const messageEl = document.getElementById('paymentMessage');
  if (!messageEl) return;
  messageEl.textContent = text || '';
  messageEl.className = type ? `payment-message ${type}` : 'payment-message';
}

async function confirmUpiPayment() {
  if (paymentInProgress) return;

  if (!selectedUpiApp) {
    setPaymentMessage('Select a UPI app first.', 'error');
    return;
  }

  clearPaymentMessage();
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
    showPaymentOverlay('failed', 'Payment failed', init.message || 'Could not start payment.');
    setPaymentMessage(init.message || 'Could not start payment', 'error');
    return;
  }

  activeTxnId = init.txnId;

  setTimeout(() => {
    openUpiApp(init.amount, init.txnId);
    showPaymentOverlay(
      'upi-open',
      'Complete in UPI app',
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

  document.getElementById('paymentOverlayCard')?.classList.remove('success-pop');
  paymentInProgress = false;
  paymentReturnedFromApp = false;
  activeTxnId = null;
  hidePaymentOverlay();
}

async function retryUpiPayment() {
  await cancelUpiPayment();
  await confirmUpiPayment();
}

function setupPaymentMethods() {
  const upiPanel = document.getElementById('upiPanel');
  const cardPanel = document.getElementById('cardPanel');
  const codPanel = document.getElementById('codPanel');
  const methods = document.querySelectorAll('.fk-method[data-method]');
  const radios = document.querySelectorAll('input[name="payment"]');

  function showPanel(selected) {
    upiPanel?.classList.toggle('hidden', selected !== 'upi');
    cardPanel?.classList.toggle('hidden', selected !== 'card');
    codPanel?.classList.toggle('hidden', selected !== 'cod');

    methods.forEach((method) => {
      method.classList.toggle('active', method.dataset.method === selected);
    });

    if (selected !== 'upi') selectUpiApp(null);
  }

  radios.forEach((radio) => {
    radio.addEventListener('change', () => showPanel(radio.value));
  });

  document.querySelectorAll('.fk-upi-circle').forEach((btn) => {
    btn.addEventListener('click', () => selectUpiApp(btn.dataset.upiApp || btn.title));
  });

  document.getElementById('upiPayBtn')?.addEventListener('click', () => confirmUpiPayment());
  document.getElementById('cardPayBtn')?.addEventListener('click', () => processPayment());
  document.getElementById('codPayBtn')?.addEventListener('click', () => processPayment());
  document.getElementById('payRetryBtn')?.addEventListener('click', () => retryUpiPayment());
  document.getElementById('payCancelBtn')?.addEventListener('click', () => cancelUpiPayment());

  showPanel(document.querySelector('input[name="payment"]:checked')?.value || 'upi');
  updateUpiPayButton();
}

function validatePayment(method) {
  if (method !== 'card') return null;

  const number = document.getElementById('cardNumber')?.value.replace(/\s/g, '') || '';
  const name = document.getElementById('cardName')?.value.trim() || '';
  const expiry = document.getElementById('cardExpiry')?.value.trim() || '';
  const cvv = document.getElementById('cardCvv')?.value.trim() || '';

  if (!/^\d{13,19}$/.test(number)) return 'Enter a valid card number.';
  if (name.length < 2) return 'Enter the name on the card.';
  if (!/^\d{2}\/\d{2}$/.test(expiry)) return 'Enter expiry as MM/YY.';
  if (!/^\d{3,4}$/.test(cvv)) return 'Enter a valid CVV.';
  return null;
}

async function processPayment() {
  if (paymentInProgress) return;

  const method = document.querySelector('input[name="payment"]:checked')?.value || 'card';
  const error = validatePayment(method);

  if (error) {
    setPaymentMessage(error, 'error');
    return;
  }

  clearPaymentMessage();
  paymentInProgress = true;

  const data = await apiFetch('/checkout', {
    method: 'POST',
    body: JSON.stringify({ paymentMethod: method })
  });

  if (!data.success) {
    paymentInProgress = false;
    setPaymentMessage(data.message || 'Payment failed', 'error');
    return;
  }

  if (method === 'cod') {
    finishPaymentSuccess(data.order, { isCod: true, notification: data.notification });
    return;
  }

  showPaymentOverlay('verifying', 'Processing payment', 'Confirming your order...');
  setTimeout(() => {
    finishPaymentSuccess(data.order, { notification: data.notification });
  }, 1800);
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
  await apiFetch('/order-details', { method: 'DELETE' });
  renderCart([]);
}

function updateCartBadge(cart) {
  const count = Array.isArray(cart)
    ? cart.reduce((sum, item) => sum + item.quantity, 0)
    : 0;
  updateCartBadgeFromCount(count);
}

async function initNav() {
  const data = await apiFetch('/auth/check', { skipAuthRedirect: true });
  const logoutBtn = document.getElementById('logoutBtn');
  const nav = document.querySelector('.nav nav');
  const logo = document.querySelector('.nav .logo');
  const current = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

  if (logoutBtn) {
    logoutBtn.style.display = data.loggedIn ? 'inline-block' : 'none';
  }

  if (logo && data.loggedIn && data.user?.username) {
    logo.title = `Signed in as ${data.user.username}`;
  }

  // Logo always returns to Home for admin and user
  if (logo) {
    logo.style.cursor = 'pointer';
    if (logo.dataset.homeBound !== '1') {
      logo.dataset.homeBound = '1';
      logo.addEventListener('click', () => {
        window.location.href = 'index.html';
      });
    }
  }

  if (!nav) {
    updateCartBadgeFromCount(data.cartCount || 0);
    return;
  }

  // Rebuild a consistent top menu: Home always present for admin + user
  nav.querySelectorAll('.nav-dynamic').forEach((el) => el.remove());

  const links = [
    { href: 'index.html', label: 'Home', match: ['index.html', '', 'home'] },
    { href: 'menu.html', label: 'Menu', match: ['menu.html'] },
    { href: 'orders.html', label: 'My Orders', match: ['orders.html'], auth: true },
    { href: 'about.html', label: 'About', match: ['about.html'] },
    { href: 'contact.html', label: 'Contact', match: ['contact.html'] }
  ];

  if (data.loggedIn && data.user?.role === 'admin') {
    links.splice(2, 0, {
      href: 'admin.html',
      label: 'Dashboard',
      match: ['admin.html'],
      auth: true
    });
  }

  nav.innerHTML = '';
  links.forEach((item) => {
    if (item.auth && !data.loggedIn) return;
    const a = document.createElement('a');
    a.href = item.href;
    a.className = 'nav-dynamic';
    a.textContent = item.label;
    if (item.match.includes(current)) a.classList.add('nav-active');
    nav.appendChild(a);

    // Place Cart right after Menu in the top bar
    if (item.label === 'Menu' && data.loggedIn) {
      const cartLink = document.createElement('a');
      cartLink.href = 'menu.html#cart';
      cartLink.className = 'nav-dynamic nav-cart-link';
      cartLink.id = 'navCartLink';
      cartLink.setAttribute('aria-label', 'Open cart');
      cartLink.innerHTML = `Cart <span id="navCartBadge" class="nav-cart-badge" hidden>0</span>`;
      cartLink.addEventListener('click', openCartFromNav);
      nav.appendChild(cartLink);
    }
  });

  if (data.loggedIn && data.user) {
    const isAdmin = data.user.role === 'admin';
    const menu = document.createElement('div');
    menu.className = `nav-account-menu nav-dynamic${isAdmin ? ' is-admin' : ''}`;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nav-user-chip nav-account-trigger';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', isAdmin ? 'Admin account menu' : 'Account menu');
    trigger.innerHTML = `<span class="nav-account-label">${isAdmin ? 'ADMIN' : 'USER'}</span>`;

    const dropdown = document.createElement('div');
    dropdown.className = 'nav-account-dropdown';
    dropdown.hidden = true;
    dropdown.innerHTML = `
      <button type="button" class="nav-account-logout" id="navLogoutBtn">Logout</button>
    `;

    const closeMenu = () => {
      menu.classList.remove('is-open');
      dropdown.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !menu.classList.contains('is-open');
      document.querySelectorAll('.nav-account-menu.is-open').forEach((el) => {
        el.classList.remove('is-open');
        const panel = el.querySelector('.nav-account-dropdown');
        const btn = el.querySelector('.nav-account-trigger');
        if (panel) panel.hidden = true;
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
      if (open) {
        menu.classList.add('is-open');
        dropdown.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      } else {
        closeMenu();
      }
    });

    dropdown.querySelector('#navLogoutBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
      logout();
    });

    if (!initNav._accountMenuBound) {
      initNav._accountMenuBound = true;
      document.addEventListener('click', () => {
        document.querySelectorAll('.nav-account-menu.is-open').forEach((el) => {
          el.classList.remove('is-open');
          const panel = el.querySelector('.nav-account-dropdown');
          const btn = el.querySelector('.nav-account-trigger');
          if (panel) panel.hidden = true;
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });
      });
    }

    menu.appendChild(trigger);
    menu.appendChild(dropdown);
    nav.appendChild(menu);
  }

  updateCartBadgeFromCount(data.cartCount || 0);

  initMobileNav();
  syncLayoutMetrics();

  if (document.body.classList.contains('menu-page') && (window.location.hash === '#cart' || new URLSearchParams(window.location.search).get('cart') === '1')) {
    setTimeout(() => toggleCart(true), 200);
  }
}

function syncLayoutMetrics() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const height = Math.ceil(nav.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--nav-height', `${Math.max(height, 52)}px`);
}

function syncMobileView() {
  const isMobile = window.matchMedia('(max-width: 800px)').matches;
  document.documentElement.classList.toggle('mobile-view', isMobile);
  if (document.body) {
    document.body.classList.toggle('mobile-view', isMobile);
  }

  const cartToggle = document.getElementById('cartToggleBtn');
  if (cartToggle && document.body?.classList.contains('menu-page')) {
    cartToggle.hidden = !isMobile;
  }

  syncLayoutMetrics();
}

function initMobileNav() {
  const header = document.querySelector('.nav');
  const nav = header?.querySelector('nav');
  if (!header || !nav) return;

  let toggle = header.querySelector('.nav-toggle');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-toggle';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    header.insertBefore(toggle, nav);

    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('nav-drawer-open', open);
      syncLayoutMetrics();
    });
  }

  nav.querySelectorAll('a').forEach((link) => {
    if (link.dataset.mobileCloseBound === '1') return;
    link.dataset.mobileCloseBound = '1';
    link.addEventListener('click', () => {
      header.classList.remove('nav-open');
      document.body.classList.remove('nav-drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      syncLayoutMetrics();
    });
  });

  if (!initMobileNav._resizeBound) {
    initMobileNav._resizeBound = true;
    const onResize = () => {
      if (window.innerWidth > 800) {
        header.classList.remove('nav-open');
        document.body.classList.remove('nav-drawer-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
      syncMobileView();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(syncMobileView, 250));
    window.matchMedia('(max-width: 800px)').addEventListener('change', syncMobileView);
  }
}

function formatOrderStatus(status) {
  return String(status || 'pending').replace(/_/g, ' ');
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadOrdersPage() {
  const list = document.getElementById('ordersList');
  const empty = document.getElementById('ordersEmpty');
  if (!list) return;

  list.innerHTML = '<p class="empty-msg">Loading orders from database...</p>';

  const auth = await apiFetch('/auth/check');
  if (!auth.loggedIn) {
    window.location.href = 'index.html';
    return;
  }

  const filterEl = document.getElementById('ordersStatusFilter');
  if (filterEl && filterEl.dataset.bound !== '1') {
    filterEl.dataset.bound = '1';
    filterEl.addEventListener('change', () => loadOrdersPage());
  }

  const filter = filterEl?.value || 'all';
  const data = await apiFetch(`/orders?status=${encodeURIComponent(filter)}`);
  const orders = data.orders || [];

  list.innerHTML = '';

  if (!data.success) {
    list.innerHTML = `<p class="empty-msg">${data.message || 'Could not load orders from database.'}</p>`;
    return;
  }

  // Summary always uses full history from DB (not only filtered view)
  const allData = filter === 'all' ? data : await apiFetch('/orders?status=all');
  const allOrders = allData.orders || orders;
  const activeStatuses = new Set(['pending', 'confirmed', 'preparing', 'out_for_delivery', 'paid']);
  const activeCount = allOrders.filter((o) => activeStatuses.has(String(o.status))).length;
  const spend = allOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const summary = document.getElementById('ordersSummary');

  if (!allOrders.length) {
    if (empty) empty.classList.remove('hidden');
    if (summary) summary.hidden = true;
    return;
  }

  if (empty) empty.classList.add('hidden');
  if (summary) {
    summary.hidden = false;
    const countEl = document.getElementById('ordersCount');
    const activeEl = document.getElementById('ordersActiveCount');
    const spendEl = document.getElementById('ordersSpend');
    if (countEl) countEl.textContent = String(allOrders.length);
    if (activeEl) activeEl.textContent = String(activeCount);
    if (spendEl) spendEl.textContent = formatRupee(spend);
  }

  if (!orders.length) {
    list.innerHTML = '<p class="empty-msg">No orders in this filter in the database.</p>';
    return;
  }

  orders.forEach((order) => {
    const card = document.createElement('article');
    card.className = 'order-card';

    const itemsHtml = (order.items || [])
      .map(
        (item) =>
          `<li><span>${item.name} × ${item.quantity}</span><strong>${formatRupee(item.price * item.quantity)}</strong></li>`
      )
      .join('');

    const status = String(order.status || 'pending');
    const isActive = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'paid'].includes(status);

    card.innerHTML = `
      <div class="order-card-head">
        <div>
          <p class="order-card-kicker">${isActive ? 'In progress' : 'Past order'} · saved in database</p>
          <h3>Order #${order.id}</h3>
        </div>
        <span class="status-pill status-${status}">${formatOrderStatus(status)}</span>
      </div>
      <p class="order-meta">${formatDateTime(order.placedAt)} · ${formatServiceType(order.serviceType)} · ${(order.paymentMethod || 'N/A').toUpperCase()}</p>
      <div class="order-details-block">${formatOrderDetailsBlock(order.orderDetails)}</div>
      <ul class="order-items">${itemsHtml}</ul>
      <div class="order-card-foot">
        <p class="order-total">Total <strong>${formatRupee(order.total)}</strong></p>
        <a class="btn-small btn-outline" href="menu.html">Add more</a>
      </div>
    `;
    list.appendChild(card);
  });
}

function updateCartBadgeFromCount(count) {
  const value = Number(count) || 0;
  const badges = [
    document.getElementById('cartBadge'),
    document.getElementById('navCartBadge')
  ].filter(Boolean);

  badges.forEach((badge) => {
    badge.textContent = String(value);
    if (badge.id === 'navCartBadge') {
      badge.hidden = value <= 0;
    } else {
      badge.style.display = value > 0 ? 'inline-block' : 'none';
    }
  });

  const navCart = document.getElementById('navCartLink');
  if (navCart) {
    navCart.setAttribute('data-count', String(value));
    navCart.classList.toggle('has-items', value > 0);
  }
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

async function initApp() {
  await checkServerHealth();
  await loadAppConfig();
  await redirectIfLoggedIn();

  const authed = await requireAuthPage();
  if (!authed) return;

  initNav();
  loadMenuItems();
  loadCheckoutPage();
  loadPaymentPage();
  loadOrdersPage();
  setupAuthForms();
  setupContactForm();

  if (document.body.classList.contains('menu-page')) {
    loadCart();
  }

  const isRegisterPage = document.getElementById('regPassword') && (document.getElementById('regPhone') || document.getElementById('regEmail') || document.getElementById('regUsername'));
  const isLoginPage = document.getElementById('username') && document.getElementById('password') && document.getElementById('loginPanel');
  const loginForm = document.getElementById('loginPanel');

  if (loginForm && (isLoginPage || isRegisterPage)) {
    loginForm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isRegisterPage) register();
        else login();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  syncMobileView();
  initApp();
  syncMobileView();
});

syncMobileView();
