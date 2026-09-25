/* Checkout requests a server-calculated total and a one-time Flutterwave payment link. */
const CHECKOUT_ENDPOINT = "/api/checkout";
const SHOP_CURRENCY = "USD";
const SHIPPING_FEE = 0; // Shipping is free.
const cart = new Map();
const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: SHOP_CURRENCY }).format(amount);

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
document.querySelectorAll('[data-product]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  const name = link.dataset.product;
  if (link.dataset.freeOver) {
    const subtotal = [...cart.values()].filter(item => item.name !== 'A Note From Jonathan').reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (subtotal <= Number(link.dataset.freeOver)) {
      toast.textContent = `The note is free with orders over ${money(Number(link.dataset.freeOver))}. Add eligible items first.`;
      toast.classList.add('show');
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => toast.classList.remove('show'), 3200);
      return;
    }
    if (cart.has(name)) {
      toast.textContent = 'One free note is included with each qualifying order.';
      toast.classList.add('show');
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => toast.classList.remove('show'), 2600);
      return;
    }
  }
  const item = cart.get(name) || { name, price: Number(link.dataset.price), quantity: 0 };
  item.quantity += 1;
  cart.set(name, item);
  renderCart();
  toast.textContent = `${name} added to your cart.`;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2200);
}));

const cartDialog = document.getElementById('cart');
function renderCart() {
  const qualifyingSubtotal = [...cart.values()].filter(item => item.name !== 'A Note From Jonathan').reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (qualifyingSubtotal <= 200) cart.delete('A Note From Jonathan');
  const items = [...cart.values()];
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  document.getElementById('cart-count').textContent = count;
  document.getElementById('cart-total').textContent = money(total + SHIPPING_FEE);
  document.getElementById('cart-subtotal').textContent = money(total);
  document.getElementById('cart-shipping').textContent = money(SHIPPING_FEE);
  const list = document.getElementById('cart-items');
  list.innerHTML = items.length ? items.map(item => `<div class="cart-item"><div><strong>${item.name}</strong><small>${money(item.price)} each</small></div><div class="quantity-control"><button type="button" data-cart-action="minus" data-name="${item.name}" aria-label="Remove one ${item.name}">−</button><span>${item.quantity}</span><button type="button" data-cart-action="plus" data-name="${item.name}" aria-label="Add one ${item.name}" ${item.name === 'A Note From Jonathan' ? 'disabled' : ''}>+</button><button type="button" class="remove-item" data-cart-action="remove" data-name="${item.name}">Remove</button></div><b>${money(item.price * item.quantity)}</b></div>`).join('') : '<p class="empty-cart">Your cart is waiting for something good.</p>';
  document.getElementById('cart-checkout').disabled = !count;
  const stickyCheckout = document.getElementById('sticky-checkout-button');
  const stickyItems = document.getElementById('sticky-cart-items');
  const stickyTotal = document.getElementById('sticky-cart-total');
  if (stickyCheckout && stickyItems && stickyTotal) {
    stickyCheckout.disabled = !count;
    stickyItems.textContent = count ? `${count} ${count === 1 ? 'item' : 'items'} in your cart` : 'Your cart is empty';
    stickyTotal.textContent = money(total + SHIPPING_FEE);
  }
  document.getElementById('shipping-total').textContent = money(total + SHIPPING_FEE);
  document.getElementById('cart-error').textContent = '';
}
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
  const payload = { customer, items: [...cart.values()].map(({ name, quantity }) => ({ name, quantity })) };
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
