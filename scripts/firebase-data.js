// ── firebase-data.js ── učitava katalog proizvoda iz Firestore baze
// Koristi Firebase Compat SDK (učitava se u HTML-u prije ove datoteke)

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Globalna varijabla koju koriste ostale skripte (category.js, shared.js, ...)
var data = null;

let dataLoadPromise = null;

/** Firestore ponekad vraća objekte umjesto nizova — pretvori u pravi array */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    return Object.keys(value)
      .filter(function(k) { return /^\d+$/.test(k); })
      .sort(function(a, b) { return Number(a) - Number(b); })
      .map(function(k) { return value[k]; });
  }
  return [];
}

/** Parsira katalog — preferira categoriesJson (pouzdano za ugniježđene podatke) */
function parseCatalogRaw(raw) {
  if (!raw) return { website: '', categories: [] };

  if (raw.categoriesJson && typeof raw.categoriesJson === 'string') {
    try {
      var parsed = JSON.parse(raw.categoriesJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { website: raw.website || 'SEKE rukotvorine', categories: parsed };
      }
    } catch (e) {
      console.warn('categoriesJson nije valjan JSON, koristim categories polje.', e);
    }
  }

  return normalizeCatalog(raw);
}

/** Normalizira katalog iz Firestore formata u isti oblik kao data.js */
function normalizeCatalog(raw) {
  if (!raw) return { website: '', categories: [] };

  const categories = toArray(raw.categories).map(function(cat) {
    return {
      name: cat.name || '',
      products: toArray(cat.products).map(function(p) {
        return {
          name: p.name || '',
          price: p.price || 0,
          desc: p.desc || '',
          detail: p.detail || '',
          images: toArray(p.images),
          image: p.image || '',
          colors: toArray(p.colors).map(function(c) {
            return { name: c.name || '', img: c.img || '' };
          })
        };
      })
    };
  });

  return {
    website: raw.website || 'SEKE rukotvorine',
    categories: categories
  };
}

function isValidCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.categories) || catalog.categories.length < 5) {
    return false;
  }

  if (!catalog.categories.every(function(c) {
    return c.name && Array.isArray(c.products) && c.products.length > 0 &&
      c.products.every(function(p) { return p && p.name; });
  })) {
    return false;
  }

  // Firestore ponekad duplicira iste proizvode u svaku kategoriju — odbaci takav katalog
  var firstNames = catalog.categories.map(function(c) { return c.products[0].name; });
  var uniqueFirst = new Set(firstNames);
  if (uniqueFirst.size < Math.min(5, catalog.categories.length)) {
    console.warn('Katalog izgleda oštećen (iste kategorije imaju iste proizvode).');
    return false;
  }

  var totalProducts = catalog.categories.reduce(function(s, c) { return s + c.products.length; }, 0);
  return totalProducts >= 20;
}

function setCatalog(catalog) {
  data = catalog;
  window.data = catalog;
  return catalog;
}

/** Fallback: učitaj lokalni data.js ako Firebase nije ispravan */
function loadLocalFallback() {
  return new Promise(function(resolve, reject) {
    if (window.__localDataLoaded && window.data) {
      setCatalog(parseCatalogRaw(window.data));
      return resolve(data);
    }
    var script = document.createElement('script');
    script.src = 'scripts/data.js';
    script.onload = function() {
      window.__localDataLoaded = true;
      if (!window.data) {
        reject(new Error('data.js nije postavio window.data'));
        return;
      }
      setCatalog(parseCatalogRaw(window.data));
      console.info('Katalog učitan iz data.js (fallback):', data.categories.length, 'kategorija');
      resolve(data);
    };
    script.onerror = function() {
      reject(new Error('Ne mogu učitati scripts/data.js'));
    };
    document.head.appendChild(script);
  });
}

function getData() {
  return data || window.data || null;
}

/**
 * Dohvaća katalog iz Firestore: collection "catalog", document "main"
 */
function loadData() {
  if (data) return Promise.resolve(data);

  if (!dataLoadPromise) {
    dataLoadPromise = db.collection('catalog').doc('main').get()
      .then(function(snap) {
        if (!snap.exists) {
          throw new Error('Dokument catalog/main ne postoji u Firestore bazi.');
        }
        var catalog = parseCatalogRaw(snap.data());
        if (!isValidCatalog(catalog)) {
          throw new Error('Firestore katalog ima neispravnu strukturu (premalo kategorija ili proizvoda).');
        }
        console.info('Katalog učitan iz Firestore:', catalog.categories.length, 'kategorija');
        return setCatalog(catalog);
      })
      .catch(function(err) {
        console.warn('Firebase učitavanje nije uspjelo, pokušavam data.js...', err);
        return loadLocalFallback();
      })
      .catch(function(err) {
        console.error('Greška pri učitavanju kataloga:', err);
        if (document.body) {
          var msg = document.createElement('p');
          msg.style.cssText = 'padding:24px;font-family:sans-serif;color:#DC2626;font-weight:700;';
          msg.textContent = err.message || 'Greška pri učitavanju podataka.';
          document.body.prepend(msg);
        }
        throw err;
      });
  }

  return dataLoadPromise;
}
