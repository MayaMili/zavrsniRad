// ── Vercel serverless funkcija: slanje dva maila pri potvrdi narudžbe ──
// 1) Vlasniku/prodavaču — obavijest o novoj narudžbi
// 2) Kupcu — potvrda primitka + javljanje s detaljima plaćanja unutar 24 sata
//
// Endpoint: POST /api/send-order-emails
// Body: { ime, prezime, email, cart: { cartId: qty, ... } }
//
// Katalog (cijene/nazivi) dohvaća se na serveru iz Firestore REST-a,
// pa klijent šalje samo košaricu — cijene se ne mogu krivotvoriti s fronta.

const nodemailer = require('nodemailer');

const PROJECT_ID = 'zavrsnirad-zmaya04';
// Napomena: (default) mora biti enkodirano (%28default%29) jer inače WHATWG URL parser puca
const CATALOG_URL =
  'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
  '/databases/%28default%29/documents/catalog/main';

const GMAIL_USER  = process.env.GMAIL_USER  || '';
const GMAIL_PASS  = process.env.GMAIL_APP_PASSWORD || '';
const OWNER_EMAIL = process.env.OWNER_EMAIL || GMAIL_USER;

const SHOP_NAME = 'SEKE Rukotvorine';

// ── Helperi ──

/** Isti ID kao na frontu: razmaci → crtice (shared.js productId) */
function productId(p) {
  return String(p.name || '').replace(/\s+/g, '-');
}

/** Dekodira jednu Firestore REST "typed" vrijednost u obični JS */
function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue'  in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue'  in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue'    in v) return null;
  if ('arrayValue'   in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue'     in v) return decodeFields(v.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  const obj = {};
  for (const k in fields) obj[k] = decodeValue(fields[k]);
  return obj;
}

/**
 * Dohvati katalog iz Firestore REST-a. Podržava oba formata:
 * categoriesJson (string) ili nativni categories (array) — kao firebase-data.js.
 */
async function fetchCatalog() {
  const resp = await fetch(CATALOG_URL);
  if (!resp.ok) throw new Error('Firestore REST greška: ' + resp.status);
  const doc = await resp.json();
  const raw = decodeFields(doc.fields || {});

  if (raw.categoriesJson && typeof raw.categoriesJson === 'string') {
    const categories = JSON.parse(raw.categoriesJson);
    if (Array.isArray(categories) && categories.length > 0) return { categories };
  }
  if (Array.isArray(raw.categories) && raw.categories.length > 0) {
    return { categories: raw.categories };
  }
  throw new Error('catalog/main nema valjan katalog (ni categoriesJson ni categories).');
}

/**
 * Razriješi košaricu u stavke. cartId = productId(naziv) + '-' + nazivBoje.
 * Bira proizvod s NAJDUŽIM podudarnim prefiksom.
 */
function resolveItems(cart, catalog) {
  const allProducts = [];
  for (const cat of catalog.categories || []) {
    for (const p of cat.products || []) allProducts.push(p);
  }

  const items = [];
  let total = 0;

  for (const [cartId, qtyRaw] of Object.entries(cart || {})) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;

    let found = null;
    let foundPid = '';
    for (const p of allProducts) {
      const pid = productId(p);
      if (cartId === pid || cartId.startsWith(pid + '-')) {
        if (pid.length > foundPid.length) { found = p; foundPid = pid; }
      }
    }
    if (!found) continue;

    const colorPart = cartId.slice(foundPid.length + 1);
    const price = Number(found.price) || 0;
    const lineTotal = price * qty;
    total += lineTotal;

    items.push({ name: found.name, color: colorPart || '', qty, price, lineTotal });
  }

  return { items, total };
}

/** Spriječi HTML injection u mailovima */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n) {
  return '€' + (Number(n) || 0).toFixed(2);
}

function itemsTableHTML(items) {
  const rows = items.map(function (it) {
    return (
      '<tr>' +
      '<td style="padding:8px;border-bottom:1px solid #eee">' + esc(it.name) +
        (it.color ? '<br><span style="color:#888;font-size:13px">Varijacija: ' + esc(it.color) + '</span>' : '') +
      '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center">' + it.qty + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:right">' + money(it.price) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid #eee;text-align:right">' + money(it.lineTotal) + '</td>' +
      '</tr>'
    );
  }).join('');

  return (
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">' +
    '<thead><tr style="text-align:left;color:#555">' +
    '<th style="padding:8px;border-bottom:2px solid #ddd">Proizvod</th>' +
    '<th style="padding:8px;border-bottom:2px solid #ddd;text-align:center">Kol.</th>' +
    '<th style="padding:8px;border-bottom:2px solid #ddd;text-align:right">Cijena</th>' +
    '<th style="padding:8px;border-bottom:2px solid #ddd;text-align:right">Ukupno</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>'
  );
}

function itemsTableText(items) {
  return items.map(function (it) {
    return '- ' + it.name + (it.color ? ' (' + it.color + ')' : '') +
      ' × ' + it.qty + ' = ' + money(it.lineTotal);
  }).join('\n');
}

function buildOwnerEmail(order, items, total) {
  const subject = 'Nova narudžba — ' + order.ime + ' ' + order.prezime;
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto">' +
    '<h2 style="color:#b56576">Nova narudžba na ' + SHOP_NAME + '</h2>' +
    '<p><strong>Kupac:</strong> ' + esc(order.ime) + ' ' + esc(order.prezime) + '<br>' +
    '<strong>Email:</strong> ' + esc(order.email) + '</p>' +
    '<h3>Naručeni proizvodi</h3>' +
    itemsTableHTML(items) +
    '<p style="text-align:right;font-size:16px"><strong>Ukupno: ' + money(total) + '</strong></p>' +
    '<p style="color:#888;font-size:13px">Dostava: besplatna. Javi se kupcu s detaljima o plaćanju unutar 24 sata.</p>' +
    '</div>';
  const text =
    'Nova narudžba na ' + SHOP_NAME + '\n\n' +
    'Kupac: ' + order.ime + ' ' + order.prezime + '\n' +
    'Email: ' + order.email + '\n\n' +
    'Proizvodi:\n' + itemsTableText(items) + '\n\n' +
    'Ukupno: ' + money(total) + '\nDostava: besplatna.';
  return { subject, html, text };
}

function buildCustomerEmail(order, items, total) {
  const subject = 'Vaša narudžba je primljena — ' + SHOP_NAME;
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#333;max-width:600px;margin:0 auto">' +
    '<h2 style="color:#b56576">Hvala na narudžbi, ' + esc(order.ime) + '!</h2>' +
    '<p>Vaša narudžba je uspješno primljena. <strong>SEKE Rukotvorine će vam se javiti s detaljima ' +
    'o plaćanju unutar 24 sata.</strong></p>' +
    '<h3>Pregled narudžbe</h3>' +
    itemsTableHTML(items) +
    '<p style="text-align:right;font-size:16px"><strong>Ukupno: ' + money(total) + '</strong></p>' +
    '<p style="color:#888;font-size:13px">Dostava je besplatna za sve narudžbe. ' +
    'Dostava u roku do 14 radnih dana nakon potvrde plaćanja.</p>' +
    '<p style="color:#888;font-size:13px">Hvala što podržavate naš obiteljski obrt! 💛<br>' + SHOP_NAME + '</p>' +
    '</div>';
  const text =
    'Hvala na narudžbi, ' + order.ime + '!\n\n' +
    'Vaša narudžba je primljena. Prodavač će vam se javiti s detaljima o plaćanju unutar 24 sata.\n\n' +
    'Pregled narudžbe:\n' + itemsTableText(items) + '\n\n' +
    'Ukupno: ' + money(total) + '\nDostava: besplatna.\n\n' +
    'Hvala što podržavate naš obiteljski obrt!\n' + SHOP_NAME;
  return { subject, html, text };
}

// ── Handler ──

module.exports = async (req, res) => {
  // CORS — radi i kad je frontend na drugoj domeni
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Dozvoljen je samo POST.' });
    return;
  }

  if (!GMAIL_USER || !GMAIL_PASS) {
    console.error('Nedostaju GMAIL_USER / GMAIL_APP_PASSWORD env varijable.');
    res.status(500).json({ error: 'Server nije konfiguriran za slanje maila.' });
    return;
  }

  // Body (Vercel parsira JSON, ali budimo sigurni i za string)
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const ime     = String(body.ime || '').trim();
  const prezime = String(body.prezime || '').trim();
  const email   = String(body.email || '').trim();
  const cart    = body.cart && typeof body.cart === 'object' ? body.cart : null;

  if (!ime || !prezime || !email || !email.includes('@')) {
    res.status(400).json({ error: 'Nedostaju ili neispravni podaci kupca.' });
    return;
  }
  if (!cart || Object.keys(cart).length === 0) {
    res.status(400).json({ error: 'Košarica je prazna.' });
    return;
  }

  // Katalog + razrješavanje stavki
  let catalog;
  try {
    catalog = await fetchCatalog();
  } catch (e) {
    console.error('Greška pri učitavanju kataloga:', e);
    res.status(502).json({ error: 'Ne mogu učitati katalog proizvoda.' });
    return;
  }

  const { items, total } = resolveItems(cart, catalog);
  if (items.length === 0) {
    res.status(400).json({ error: 'Nijedan proizvod iz košarice nije prepoznat.' });
    return;
  }

  const order = { ime, prezime, email };
  const ownerMail    = buildOwnerEmail(order, items, total);
  const customerMail = buildCustomerEmail(order, items, total);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });

  const from = SHOP_NAME + ' <' + GMAIL_USER + '>';

  try {
    await Promise.all([
      transporter.sendMail({
        from, to: OWNER_EMAIL, replyTo: email,
        subject: ownerMail.subject, text: ownerMail.text, html: ownerMail.html,
      }),
      transporter.sendMail({
        from, to: email, replyTo: OWNER_EMAIL,
        subject: customerMail.subject, text: customerMail.text, html: customerMail.html,
      }),
    ]);
  } catch (e) {
    console.error('Greška pri slanju maila:', e);
    res.status(502).json({ error: 'Slanje maila nije uspjelo. Pokušajte ponovno.' });
    return;
  }

  console.log('Mailovi poslani:', { kupac: email, stavki: items.length, ukupno: total });
  res.status(200).json({ ok: true, items: items.length, total });
};
