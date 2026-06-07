document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  let catName = params.get('cat');

  // Bez ?cat= preusmjeri na Dekice (zadrži /category ili category.html)
  if (!catName) {
    const page = window.location.pathname.split('/').pop() || 'category';
    const target = page.includes('category') ? page : 'category';
    window.location.replace(target + '?cat=' + encodeURIComponent('Dekice'));
    return;
  }

  catName = decodeURIComponent(catName);

  await loadData();
  const catalog = getData();

  const cat = catalog.categories.find(c => c.name === catName);
  if (!cat) {
    document.getElementById('cat-title').textContent = 'Kategorija nije pronađena';
    document.getElementById('cat-count').textContent =
      'Traženo: "' + catName + '". Dostupno: ' +
      catalog.categories.map(c => c.name).join(', ');
    return;
  }

  document.querySelectorAll('.sidebar-link[data-cat]').forEach(a => {
    if (a.dataset.cat === catName) a.classList.add('active');
  });

  const products = cat.products.filter(p => p && p.name && typeof p.price === 'number');

  document.title = catName + ' – SEKE Rukotvorine';
  document.getElementById('cat-title').textContent = catName;
  document.getElementById('cat-count').textContent = products.length + ' proizvoda';

  const grid = document.getElementById('products-grid');

  products.forEach((product, i) => {
    const id   = productId(product);
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.animationDelay = (i * 0.06) + 's';
    card.innerHTML =
      '<div class="product-card-img">' +
        '<img src="images/' + getFirstImage(product) + '" alt="' + product.name + '"' +
        ' onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="img-placeholder" style="display:none">🧶</div>' +
      '</div>' +
      '<div class="product-card-body">' +
        '<p class="product-card-name">' + product.name + '</p>' +
        '<p class="product-card-desc">' + product.desc + '</p>' +
        '<div class="product-card-footer">' +
          '<span class="product-card-price">€' + product.price + '</span>' +
          '<a href="product?id=' + encodeURIComponent(id) + '" class="btn-pogledaj">Pogledaj</a>' +
        '</div>' +
      '</div>';
    grid.appendChild(card);
  });
});
