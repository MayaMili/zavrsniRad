document.addEventListener('DOMContentLoaded', async () => {
  await loadData();

  const cart = getCart();

  if (Object.keys(cart).length === 0) {
    window.location.href = 'cart.html'; return;
  }

  let subtotal = 0;
  let html = '';

  for (const [cartId, qty] of Object.entries(cart)) {
    let found = null;
    const catalog = getData();
    for (const cat of catalog.categories) {
      for (const p of cat.products) {
        if (cartId.startsWith(productId(p))) { found = p; break; }
      }
      if (found) break;
    }
    if (!found) continue;

    const colorPart = cartId.slice(productId(found).length + 1);
    const col = (found.colors || []).find(c => c.name === colorPart);
    const price = found.price || 0;
    subtotal += price * qty;

    html += `
      <div class="summary-product">
        <div class="summary-img">
          <img src="images/${getFirstImage(found)}" onerror="this.parentNode.classList.add('img-error')">
          <span class="img-emoji">🧶</span>
        </div>
        <div>
          <p class="summary-name">${found.name}</p>
          ${col ? `<p class="summary-qty" 
            style="display:flex;align-items:center;gap:4px">
            
            <span style="
              width:12px;
              height:12px;
              border-radius:50%;
              background-image:url('images/${col?.img}');
              background-size:cover;
              background-position:center;
              background-repeat:no-repeat;
              display:inline-block;
              border:1px solid rgba(0,0,0,0.1);">
            </span>
            ${col.name}</p>` : ''}
          <p class="summary-qty">Količina: ${qty}</p>
        </div>
        <span class="summary-price">€${(price * qty).toFixed(2)}</span>
      </div>`;
  }

  document.getElementById('summary-products').innerHTML = html;

  // const shippingFree = subtotal >= 50;
  // const total = subtotal + (shippingFree ? 0 : 5);
  // document.getElementById('subtotal-val').textContent = `€${subtotal.toFixed(2)}`;
  // document.getElementById('shipping-val').textContent = shippingFree ? 'Besplatna' : '€5.00';
  // document.getElementById('shipping-val').className = shippingFree ? 'free' : '';
  // document.getElementById('total-val').textContent = `€${total.toFixed(2)}`;

  const shipping = 0;
  const total = subtotal + shipping;
  document.getElementById('subtotal-val').textContent = `€${subtotal.toFixed(2)}`;
  document.getElementById('shipping-val').textContent = 'Besplatna';
  document.getElementById('shipping-val').className = 'free';
  document.getElementById('total-val').textContent = `€${total.toFixed(2)}`;
});

async function submitOrder() {
  const ime     = document.getElementById('f-ime').value.trim();
  const prezime = document.getElementById('f-prezime').value.trim();
  const email   = document.getElementById('f-email').value.trim();

  let valid = true;
  ['f-ime','f-prezime','f-email'].forEach(id => {
    const el = document.getElementById(id);
    if (!el.value.trim()) { el.classList.add('error'); valid = false; }
    else el.classList.remove('error');
  });

  // Email mora sadržavati znak @
  const emailEl   = document.getElementById('f-email');
  const emailErr  = document.getElementById('email-error');
  if (email && !email.includes('@')) {
    emailEl.classList.add('error');
    if (emailErr) emailErr.style.display = 'block';
    valid = false;
    if (typeof announceWarning === 'function' && isA11yOn()) {
      announceWarning('Upozorenje: email adresa nije ispravno unesena. Mora sadržavati znak @.');
    }
    emailEl.focus();
  } else if (emailErr) {
    emailErr.style.display = 'none';
  }

  if (!valid) return;

  const cart = getCart();
  const btn  = document.getElementById('submit-btn');
  const errBox = document.getElementById('submit-error');

  // Onemogući gumb dok traje slanje (sprječava dvostruku narudžbu)
  const btnText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Šalje se…';
  if (errBox) errBox.style.display = 'none';

  try {
    // Pošalji mailove preko serverless funkcije (vlasniku + kupcu)
    const resp = await fetch('/api/send-order-emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ime, prezime, email, cart })
    });
    if (!resp.ok) {
      let msg = 'Slanje narudžbe nije uspjelo.';
      try { const j = await resp.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }

    // Uspjeh: spremi narudžbu za potvrdu, očisti košaricu i preusmjeri
    localStorage.setItem('lastOrder', JSON.stringify({ ime, prezime, email, cart }));
    localStorage.removeItem('cart');
    window.location.href = 'confirmation.html';
  } catch (err) {
    // Greška: prikaži poruku i NE briši košaricu (moguć ponovni pokušaj)
    console.error('Slanje narudžbe nije uspjelo:', err);
    btn.disabled = false;
    btn.textContent = btnText;
    if (errBox) {
      errBox.textContent = 'Slanje narudžbe trenutno nije uspjelo. Molimo pokušajte ponovno.';
      errBox.style.display = 'block';
    }
    if (typeof announceWarning === 'function' && isA11yOn()) {
      announceWarning('Upozorenje: slanje narudžbe nije uspjelo. Molimo pokušajte ponovno.');
    }
  }
}
