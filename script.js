/* Checkout requests a server-calculated total and a one-time Flutterwave payment link. */
const CHECKOUT_ENDPOINT = "/api/checkout";
const SHOP_CURRENCY = "USD";
const SHIPPING_FEE = 0; // Shipping is free.
const CART_STORAGE_KEY = 'roumie-shop-cart';
const COUPON_RATES = { CHOSEN30: 0.30, JR40: 0.40 };
let appliedCoupon = '';
let savedCart = [];
try {
  const parsedCart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
  if (Array.isArray(parsedCart)) savedCart = parsedCart.filter(item => item && typeof item.name === 'string' && Number.isFinite(Number(item.price)) && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0);
} catch { /* Start with an empty cart if browser storage is unavailable or invalid. */ }
function migrateSavedCart(items) {
  const migrated = new Map();
  for (const item of items) {
    const isCollectionPreorder = item.name === 'J. Roumie Collection Pre-order' || item.name === 'JR Collection Pre-order';
    const normalized = isCollectionPreorder
      ? { ...item, name: 'JR Collection Pre-order', price: 499.99, quantity: Number(item.quantity) }
      : { ...item, price: Number(item.price), quantity: Number(item.quantity) };
    const previous = migrated.get(normalized.name);
    if (previous) previous.quantity = Math.min(50, previous.quantity + normalized.quantity);
    else migrated.set(normalized.name, normalized);
  }
  return migrated;
}
const cart = migrateSavedCart(savedCart);
try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify([...cart.values()])); } catch { /* Keep the in-memory cart if browser storage is unavailable. */ }
const launchParams = new URLSearchParams(location.search);
const donationChoice = launchParams.get('donation');
const fixedDonations = { '100': 100, '150': 150, '1000': 1000 };
if (donationChoice && fixedDonations[donationChoice]) {
  const name = `Halloween Donation — $${fixedDonations[donationChoice]}`;
  if (!cart.has(name)) cart.set(name, { name, price: fixedDonations[donationChoice], quantity: 1 });
} else if (donationChoice === 'custom') {
  const customAmount = Number(launchParams.get('amount'));
  if (Number.isInteger(customAmount) && customAmount >= 1 && customAmount <= 100000) {
    const name = `Halloween Donation — Custom — $${customAmount}`;
    if (!cart.has(name)) cart.set(name, { name, price: customAmount, quantity: 1 });
  }
}
const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: SHOP_CURRENCY }).format(amount);

function productSlug(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function syncProductLink(link) {
  const card = link.closest('.product-card');
  if (!card) return;
  const product = link.dataset.product;
  const image = card.querySelector('.product-photo');
  const variantSelect = card.querySelector('[data-product-variant]');
  const colorSelect = card.querySelector('[data-tee-color]');
  const sizeSelect = card.querySelector('[data-tee-size], [data-apparel-size]');
  const query = new URLSearchParams({ product: productSlug(product) });
  if (colorSelect) query.set('color', colorSelect.value);
  if (sizeSelect || variantSelect) query.set('size', variantSelect?.value || sizeSelect?.value || '');
  link.href = `product.html?${query}`;
  const title = card.querySelector('.product-info h3');
  if (title && !title.querySelector('a')) {
    const titleLink = document.createElement('a');
    titleLink.textContent = title.textContent.trim();
    titleLink.href = link.href;
    title.replaceChildren(titleLink);
  } else if (title?.querySelector('a')) title.querySelector('a').href = link.href;
}

document.querySelectorAll('[data-product]').forEach(syncProductLink);

const categoryButtons = document.querySelectorAll('.category');
const productCards = document.querySelectorAll('.product-card');
categoryButtons.forEach(button => button.addEventListener('click', () => {
  categoryButtons.forEach(item => { item.classList.remove('active'); item.setAttribute('aria-selected', 'false'); });
  button.classList.add('active');
  button.setAttribute('aria-selected', 'true');
  const filter = button.dataset.filter;
  productCards.forEach(card => { card.hidden = filter !== 'all' && card.dataset.category !== filter; });
}));

const toast = document.getElementById('toast');
let toastTimeout;
document.querySelectorAll('[data-product-variant]').forEach(select => select.addEventListener('change', () => {
  const price = Number(select.selectedOptions[0]?.dataset.price);
  const display = select.closest('.product-card')?.querySelector('[data-variant-price]');
  if (display && Number.isFinite(price)) display.textContent = money(price);
  const link = select.closest('.product-card')?.querySelector('[data-product]');
  if (link) syncProductLink(link);
}));
document.querySelectorAll('[data-tee-color]').forEach(select => select.addEventListener('change', () => {
  const option = select.selectedOptions[0];
  const image = select.closest('.product-card')?.querySelector('.product-photo');
  if (image && option?.dataset.image) {
    image.src = option.dataset.image;
    image.alt = `The Roumie Club T-shirt in ${option.value}`;
  }
  const link = select.closest('.product-card')?.querySelector('[data-product]');
  if (link) syncProductLink(link);
}));

const cartDialog = document.getElementById('cart');
function renderCart() {
  const qualifyingSubtotal = [...cart.values()].filter(item => item.name !== 'A Note From Jonathan').reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (qualifyingSubtotal <= 200) cart.delete('A Note From Jonathan');
  const items = [...cart.values()];
  try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)); } catch { /* Cart remains usable for this page view. */ }
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountRate = COUPON_RATES[appliedCoupon] || 0;
  const discountableSubtotal = items.filter(item => !item.name.startsWith('Halloween Donation — ') && item.name !== 'A Note From Jonathan').reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discount = discountRate ? Math.round(discountableSubtotal * discountRate * 100) / 100 : 0;
  const orderTotal = Math.max(0, total - discount + SHIPPING_FEE);
  document.getElementById('cart-count').textContent = count;
  document.getElementById('cart-total').textContent = money(orderTotal);
  document.getElementById('cart-subtotal').textContent = money(total);
  document.getElementById('cart-shipping').textContent = money(SHIPPING_FEE);
  document.getElementById('coupon-discount-row').hidden = !appliedCoupon;
  document.getElementById('coupon-discount').textContent = `−${money(discount)}`;
  document.getElementById('coupon-code').value = appliedCoupon;
  document.getElementById('coupon-status').textContent = appliedCoupon
    ? discountableSubtotal > 0
      ? `${appliedCoupon} applied — ${Math.round(discountRate * 100)}% off eligible merchandise. Donations are excluded.`
      : `${appliedCoupon} only applies to merchandise and JR Collection items. Donations are not discounted.`
    : '';
  document.querySelector('#coupon-discount-row span').textContent = appliedCoupon ? `${appliedCoupon} · ${Math.round(discountRate * 100)}% off` : '';
  const list = document.getElementById('cart-items');
  list.innerHTML = items.length ? items.map(item => `<div class="cart-item"><div><strong>${item.name}</strong><small>${money(item.price)} each</small></div><div class="quantity-control"><button type="button" data-cart-action="minus" data-name="${item.name}" aria-label="Remove one ${item.name}">−</button><span>${item.quantity}</span><button type="button" data-cart-action="plus" data-name="${item.name}" aria-label="Add one ${item.name}" ${item.name === 'A Note From Jonathan' ? 'disabled' : ''}>+</button><button type="button" class="remove-item" data-cart-action="remove" data-name="${item.name}">Remove</button></div><b>${money(item.price * item.quantity)}</b></div>`).join('') : '<p class="empty-cart">Your cart is waiting for something good.</p>';
  document.getElementById('cart-checkout').disabled = !count;
  const stickyCheckout = document.getElementById('sticky-checkout-button');
  const stickyItems = document.getElementById('sticky-cart-items');
  const stickyTotal = document.getElementById('sticky-cart-total');
  if (stickyCheckout && stickyItems && stickyTotal) {
    stickyCheckout.disabled = !count;
    stickyItems.textContent = count ? `${count} ${count === 1 ? 'item' : 'items'} in your cart` : 'Your cart is empty';
    stickyTotal.textContent = money(orderTotal);
  }
  document.getElementById('shipping-total').textContent = money(orderTotal);
  document.getElementById('cart-error').textContent = '';
  const noShippingOnly = items.length > 0 && items.every(item => item.name.startsWith('Halloween Donation — '));
  document.querySelectorAll('.delivery-field').forEach(label => {
    label.hidden = noShippingOnly;
    const input = label.querySelector('input, textarea');
    if (input) {
      if (!label.dataset.requiredState) label.dataset.requiredState = input.required ? 'required' : 'optional';
      input.required = !noShippingOnly && label.dataset.requiredState === 'required';
    }
  });
  document.querySelector('.shipping-modal h2').textContent = noShippingOnly ? 'Your details for giving' : 'Where should we send it?';
  document.querySelector('.shipping-modal .modal-description').textContent = noShippingOnly ? 'Enter your contact details to continue to secure payment checkout.' : 'Enter your contact and delivery details, then continue to secure payment checkout.';
}
document.getElementById('coupon-form').addEventListener('submit', event => {
  event.preventDefault();
  const entered = document.getElementById('coupon-code').value.trim().toUpperCase();
  const status = document.getElementById('coupon-status');
  if (!entered) {
    const wasApplied = Boolean(appliedCoupon);
    appliedCoupon = '';
    renderCart();
    document.getElementById('coupon-status').textContent = wasApplied ? 'Coupon removed.' : 'Enter a coupon code to apply a discount.';
    return;
  }
  if (!Object.hasOwn(COUPON_RATES, entered)) {
    appliedCoupon = '';
    status.textContent = 'That code wasn’t recognized. Check it and try again.';
    renderCart();
    document.getElementById('coupon-code').value = entered;
    document.getElementById('coupon-status').textContent = status.textContent;
    return;
  }
  appliedCoupon = entered;
  renderCart();
});
document.getElementById('cart-trigger').addEventListener('click', () => cartDialog.showModal());
document.getElementById('cart-close').addEventListener('click', () => cartDialog.close());
cartDialog.addEventListener('click', event => { if (event.target === cartDialog) cartDialog.close(); });
document.getElementById('cart-items').addEventListener('click', event => {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const item = cart.get(button.dataset.name);
  if (button.dataset.cartAction === 'remove' || (button.dataset.cartAction === 'minus' && item.quantity <= 1)) cart.delete(button.dataset.name);
  else if (button.dataset.cartAction === 'minus') item.quantity -= 1;
  else item.quantity += 1;
  renderCart();
});
function openShippingCheckout() {
  if (cartDialog.open) cartDialog.close();
  document.getElementById('checkout-status').textContent = '';
  document.getElementById('shipping-checkout').showModal();
}
document.getElementById('cart-checkout').addEventListener('click', openShippingCheckout);
document.getElementById('sticky-checkout-button').addEventListener('click', openShippingCheckout);
document.getElementById('shipping-close').addEventListener('click', () => document.getElementById('shipping-checkout').close());
document.getElementById('shipping-checkout').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.getElementById('shipping-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.getElementById('shipping-submit');
  const status = document.getElementById('checkout-status');
  submit.disabled = true;
  status.textContent = 'Preparing your secure payment...';
  const customer = Object.fromEntries(new FormData(form).entries());
  const payload = { customer, couponCode: appliedCoupon || undefined, items: [...cart.values()].map(({ name, quantity }) => ({ name, quantity })) };
  try {
    const response = await fetch(CHECKOUT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok || !result.paymentLink) throw new Error(result.error || 'Checkout could not be prepared. Please try again.');
    window.location.assign(result.paymentLink);
  } catch (error) {
    status.textContent = error.message.includes('Failed to fetch') ? 'Online checkout needs the website’s secure payment service to be set up. Your cart is saved here; please try again later.' : error.message;
    submit.disabled = false;
  }
});
renderCart();
if (launchParams.has('donation')) requestAnimationFrame(() => cartDialog.showModal());
if (launchParams.has('cart')) requestAnimationFrame(() => cartDialog.showModal());

const modal = document.getElementById('booking');
const bookingKind = document.getElementById('booking-kind');
document.querySelectorAll('[data-booking]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  const isZoom = link.dataset.booking === 'zoom';
  bookingKind.value = isZoom ? 'zoom_course' : 'meet_greet';
  document.getElementById('booking-title').textContent = isZoom ? 'Ask about a Zoom course' : 'Ask about a meet & greet';
  const success = document.getElementById('booking-success');
  success.classList.remove('show', 'form-error');
  success.textContent = '';
  document.getElementById('booking-submit').disabled = false;
  modal.showModal();
}));
document.querySelector('.modal-close').addEventListener('click', () => modal.close());
modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
document.getElementById('booking-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.getElementById('booking-submit');
  const success = document.getElementById('booking-success');
  submit.disabled = true;
  success.classList.remove('form-error');
  success.textContent = 'Sending your request...';
  success.classList.add('show');
  const details = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch('/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(details) });
    const result = await response.json();
    if (!response.ok || !result.saved) throw new Error(result.error || 'Your request could not be saved. Please try again.');
    success.textContent = result.notificationSent
      ? 'Thanks! Your request was sent to Jonathan’s team. They’ll follow up by email.'
      : 'Your request is saved. The team email alert is not configured yet, but the request is available in the Supabase inquiries table.';
    form.reset();
  } catch (error) {
    success.textContent = error.message.includes('Failed to fetch')
      ? 'The request service is not available yet. Please try again after the shop has been deployed.'
      : error.message;
    success.classList.add('form-error');
    submit.disabled = false;
  }
});

document.getElementById('newsletter-form').addEventListener('submit', event => {
  event.preventDefault();
  const message = document.getElementById('newsletter-message');
  message.textContent = 'You’re on the list. Look out for a little note from Jonathan!';
  message.style.color = '#f8d491';
  event.currentTarget.reset();
});
