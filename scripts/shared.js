// ── shared.js ── zajednički kod za sve stranice

// ════════════════════════════════════════════════════════════
//  NAČIN ZA SLIJEPE I SLABOVIDNE OSOBE (a11y mode)
//  Stanje se pamti u localStorage pa ostaje uključeno
//  kroz sve stranice i nakon ponovnog učitavanja.
// ════════════════════════════════════════════════════════════
const A11Y_KEY = 'a11yMode';

function isA11yOn() {
  return localStorage.getItem(A11Y_KEY) === 'on';
}

// Dodaje/uklanja klasu na <html> i ažurira stanje gumba
function applyA11yMode(on) {
  document.documentElement.classList.toggle('a11y-mode', on);
  const btn = document.getElementById('a11y-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute(
      'aria-label',
      on ? 'Isključi način za slijepe i slabovidne osobe'
         : 'Uključi način za slijepe i slabovidne osobe'
    );
  }
}

// Govorna najava (polite) — čita se kad čitač završi trenutnu rečenicu
function announceA11y(msg) {
  const region = document.getElementById('a11y-announcer');
  if (!region) return;
  region.textContent = '';
  setTimeout(() => { region.textContent = msg; }, 60);
}

// Govorno upozorenje (assertive) — odmah prekida i čita poruku
function announceWarning(msg) {
  const region = document.getElementById('a11y-asserter');
  if (!region) return;
  region.textContent = '';
  setTimeout(() => { region.textContent = msg; }, 60);
}

function toggleA11yMode() {
  const on = !isA11yOn();
  localStorage.setItem(A11Y_KEY, on ? 'on' : 'off');
  applyA11yMode(on);
  announceA11y(
    on ? 'Način za slijepe i slabovidne osobe je uključen.'
       : 'Način za slijepe i slabovidne osobe je isključen.'
  );
}

// Primijeni odmah (prije iscrtavanja) da se izbjegne treperenje
applyA11yMode(isA11yOn());

function updateCartCount() {
  const cart = JSON.parse(localStorage.getItem('cart') || '{}');
  const total = Object.values(cart).reduce((s, q) => s + q, 0);
  const badge = document.getElementById('cart-count');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
  }
}

function addToCart(productId, qty = 1) {
  const cart = JSON.parse(localStorage.getItem('cart') || '{}');
  cart[productId] = (cart[productId] || 0) + qty;
  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}

function getCart() {
  return JSON.parse(localStorage.getItem('cart') || '{}');
}

function getCartTotal() {
  const cart = getCart();
  const catalog = typeof getData === 'function' ? getData() : data;
  if (!catalog) return 0;
  let subtotal = 0;
  for (const category of catalog.categories) {
    for (const product of category.products) {
      const id = productId(product);
      if (cart[id]) subtotal += (product.price || 0) * cart[id];
    }
  }
  return subtotal;
}

function productId(product) {
  return product.name.replace(/\s+/g, '-');
}

/** Link na stranicu kategorije — bez .html (radi s localhost:3000/category) */
function categoryUrl(catName) {
  return 'category?cat=' + encodeURIComponent(catName);
}

// Vraca prvu sliku proizvoda — podrzava i stari "image" i novi "images" format
function getFirstImage(product) {
  if (product.images && product.images.length > 0) return product.images[0];
  return product.image || '';
}

function findProduct(id) {
  const catalog = typeof getData === 'function' ? getData() : data;
  if (!catalog) return null;
  const searchId = decodeURIComponent(id || '').trim();
  for (const cat of catalog.categories) {
    for (const p of cat.products) {
      if (productId(p) === searchId) return { product: p, category: cat };
    }
  }
  return null;
}

// Mark active sidebar link based on current page
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();

  // Highlight active sidebar category from URL param
  const params = new URLSearchParams(window.location.search);
  const catParam = params.get('cat');
  if (catParam) {
    const decoded = decodeURIComponent(catParam);
    document.querySelectorAll('.sidebar-link').forEach(a => {
      if (a.dataset.cat === decoded) a.classList.add('active');
    });
  }

  // ── a11y: skriveno polje za najave čitaču ekrana (polite — čeka red) ──
  if (!document.getElementById('a11y-announcer')) {
    const live = document.createElement('div');
    live.id = 'a11y-announcer';
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    document.body.appendChild(live);
  }

  // ── a11y: assertive regija za upozorenja (odmah prekida i čita) ──
  if (!document.getElementById('a11y-asserter')) {
    const asserter = document.createElement('div');
    asserter.id = 'a11y-asserter';
    asserter.className = 'sr-only';
    asserter.setAttribute('aria-live', 'assertive');
    asserter.setAttribute('aria-atomic', 'true');
    document.body.appendChild(asserter);
  }

  // ── a11y: "Preskoči na glavni sadržaj" — prvi fokusabilni element ──
  const mainEl = document.querySelector('main');
  if (mainEl && !document.getElementById('skip-link')) {
    if (!mainEl.id) mainEl.id = 'main-content';
    mainEl.setAttribute('tabindex', '-1');
    const skip = document.createElement('a');
    skip.id = 'skip-link';
    skip.className = 'skip-link';
    skip.href = '#' + mainEl.id;
    skip.textContent = 'Preskoči na glavni sadržaj';
    document.body.insertBefore(skip, document.body.firstChild);
  }

  // ── a11y: poveži gumb iz headera ──
  const a11yBtn = document.getElementById('a11y-toggle');
  if (a11yBtn) {
    applyA11yMode(isA11yOn());
    a11yBtn.addEventListener('click', toggleA11yMode);
  }
});
