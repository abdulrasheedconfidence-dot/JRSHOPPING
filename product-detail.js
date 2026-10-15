const CART_STORAGE_KEY = 'roumie-shop-cart';
const params = new URLSearchParams(location.search);
const slug = params.get('product') || '';
const requestedColor = params.get('color') || '';
const requestedSize = params.get('size') || '';
const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
const products = Array.isArray(window.PRODUCT_CATALOG) ? window.PRODUCT_CATALOG : [];

function safeCartRead() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.name === 'string' && Number.isFinite(Number(item.price)) && Number.isInteger(Number(item.quantity)) && Number(item.quantity) > 0) : [];
  } catch { return []; }
}

function renderCartCount() {
  const count = safeCartRead().reduce((sum, item) => sum + Number(item.quantity), 0);
  document.getElementById('product-cart-count').textContent = count;
  document.getElementById('sticky-product-count').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
}

function fail() {
  document.querySelector('main').innerHTML = '<section class="product-not-found"><p class="eyebrow">SHOP THE COLLECTION</p><h1>We couldn’t find<br><em>that piece.</em></h1><p>It may have moved. Browse the full collection to find what you’re looking for.</p><a class="button button-dark" href="index.html#shop">Back to the shop <span aria-hidden="true">↗</span></a></section>';
  document.title = 'Product not found — Jonathan Roumie Shop';
}

function initProduct(product) {
  const image = document.getElementById('product-image');
  const placeholder = document.getElementById('product-placeholder');
  const badge = document.getElementById('product-badge');
  const optionsRoot = document.getElementById('product-options');
  const price = document.getElementById('product-price');
  const quantityInput = document.getElementById('product-quantity');
  const quantityMinus = document.getElementById('quantity-minus');
  const quantityPlus = document.getElementById('quantity-plus');
  const addButton = document.getElementById('product-add');
  const status = document.getElementById('product-status');

  let selectedColor = product.colors?.some(option => option.value === requestedColor) ? requestedColor : product.selectedColor || '';
  const sizes = product.pricedSizes?.length ? product.pricedSizes.map(option => option.value) : product.sizes || [];
  let selectedSize = sizes.includes(requestedSize) ? requestedSize : product.selectedSize || sizes[0] || '';
  let unitPrice = product.pricedSizes?.find(option => option.value === selectedSize)?.price ?? product.price;

  document.title = `${product.title} — Jonathan Roumie Shop`;
  document.querySelector('meta[name="description"]').content = `${product.description} View product details and options for ${product.title}.`;
  document.getElementById('product-category').textContent = ({ wear: 'Wear it', home: 'Keep it close', care: 'Care packages', personalized: 'Personalized gifts', rosary: 'Rosaries' })[product.category] || 'Shop';
  document.getElementById('product-kicker').textContent = product.badge || 'JONATHAN ROUMIE SHOP';
  document.getElementById('product-title').textContent = product.title;
  document.getElementById('product-description').textContent = product.description;
  document.getElementById('product-detail-copy').textContent = product.details;
  document.getElementById('product-inspiration').textContent = product.inspiration;
  placeholder.textContent = product.title;
  document.getElementById('product-option-summary').textContent = product.colors?.length
    ? `Color choices: ${product.colors.map(option => option.value).join(', ')}. Sizes: ${sizes.join(', ')}.`
    : sizes.length ? `Available sizes: ${sizes.join(', ')}.` : 'Select a quantity below, then add this item to your cart.';
  if (product.badge) { badge.textContent = product.badge; badge.hidden = false; }

  image.addEventListener('error', () => { image.hidden = true; placeholder.hidden = false; });
  function updateImage() {
    const colorOption = product.colors?.find(option => option.value === selectedColor);
    const path = colorOption?.image || product.image;
    if (!path) { image.hidden = true; placeholder.hidden = false; return; }
    image.src = path;
    image.alt = selectedColor ? `${product.alt} — ${selectedColor}` : product.alt;
    image.hidden = false;
    placeholder.hidden = true;
  }
  function updatePrice() {
    unitPrice = product.pricedSizes?.find(option => option.value === selectedSize)?.price ?? product.price;
    price.textContent = unitPrice === 0 ? 'Free add-on' : `${money(unitPrice)} each`;
    document.getElementById('product-line-total').textContent = unitPrice === 0 ? 'Free add-on' : money(unitPrice * Number(quantityInput.value || 1));
  }
  function setQuantity(value) {
    const maximum = product.freeOver ? 1 : 50;
    quantityInput.value = Math.min(maximum, Math.max(1, Math.floor(Number(value) || 1)));
    quantityMinus.disabled = Number(quantityInput.value) <= 1 || Boolean(product.freeOver);
    quantityPlus.disabled = Number(quantityInput.value) >= maximum || Boolean(product.freeOver);
    updatePrice();
  }
  function addToCart() {
    const items = safeCartRead();
    const subtotal = items.filter(item => item.name !== 'A Note From Jonathan').reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    if (product.freeOver && subtotal <= product.freeOver) {
      status.textContent = `This free add-on is available with orders over ${money(product.freeOver)}. Add eligible items first.`;
      return;
    }
    let name = product.product;
    if (product.colors?.length) name = `${name} — ${selectedColor} — ${selectedSize}`;
    else if (selectedSize) name = `${name} — ${selectedSize}`;
    const existing = items.find(item => item.name === name);
    if (product.freeOver && existing) {
      status.textContent = 'Only one free note is included with each qualifying order.';
      return;
    }
    const quantity = Number(quantityInput.value);
    if (existing && Number(existing.quantity) + quantity > 50) {
      status.textContent = 'You can add up to 50 of one item per order.';
      return;
    }
    if (existing) existing.quantity = Number(existing.quantity) + quantity;
    else items.push({ name, price: unitPrice, quantity });
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)); }
    catch { status.textContent = 'Your browser could not save the cart. Please check storage settings and try again.'; return; }
    renderCartCount();
    status.textContent = `${quantity} × ${product.title} added to your cart.`;
  }

  if (product.colors?.length) {
    const label = document.createElement('label'); label.append('COLOR');
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Choose color');
    product.colors.forEach(option => select.add(new Option(option.value, option.value)));
    select.value = selectedColor || product.colors[0].value;
    select.addEventListener('change', () => { selectedColor = select.value; updateImage(); });
    label.append(select); optionsRoot.append(label);
  }
  if (sizes.length) {
    const label = document.createElement('label'); label.append('SIZE');
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Choose size');
    sizes.forEach(value => {
      const sizedPrice = product.pricedSizes?.find(option => option.value === value)?.price;
      select.add(new Option(sizedPrice === undefined ? value : `${value} · ${money(sizedPrice)}`, value));
    });
    select.value = selectedSize;
    select.addEventListener('change', () => { selectedSize = select.value; updatePrice(); });
    label.append(select); optionsRoot.append(label);
  }

  quantityInput.max = product.freeOver ? '1' : '50';
  quantityInput.addEventListener('input', () => setQuantity(quantityInput.value));
  quantityMinus.addEventListener('click', () => setQuantity(Number(quantityInput.value) - 1));
  quantityPlus.addEventListener('click', () => setQuantity(Number(quantityInput.value) + 1));
  addButton.disabled = false;
  addButton.addEventListener('click', addToCart);
  setQuantity(1);
  updateImage();
}

renderCartCount();
const product = products.find(item => item.id === slug);
if (product) initProduct(product); else fail();
