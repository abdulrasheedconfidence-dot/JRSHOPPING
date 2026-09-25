const crypto = require('node:crypto');

const PRODUCTS = {
  'The Roumie Club Tee': 50,
  'The Good Days Mug': 20,
  'The Roumie Cap': 25,
  'A Little Care Box': 149,
  'The Jonathan Care Package': 499,
  'The Moments Print': 99,
  'Custom Photo Frame with Jonathan': 499,
  'The Sunday Plate': 25,
  'The Good Things Tote': 25,
  'A Note From Jonathan': 0
};
const CURRENCY = process.env.SHOP_CURRENCY || 'USD';
const SHIPPING_FEE = Number(process.env.SHIPPING_FEE || 0);

function reply(res, status, body) {
  return res.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret) throw new Error('Order storage is not configured.');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || 'Order storage request failed.');
  return result;
}

module.exports = async function checkout(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (!process.env.FLW_SECRET_KEY) return reply(res, 503, { error: 'Secure checkout is not configured yet. Please contact the shop.' });

  const customer = req.body?.customer || {};
  const required = ['name', 'email', 'phone', 'country', 'address', 'city', 'state'];
  if (required.some(field => typeof customer[field] !== 'string' || !customer[field].trim())) {
    return reply(res, 400, { error: 'Please fill in your name, email, phone and full delivery address.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return reply(res, 400, { error: 'Please enter a valid email address.' });
  if (!Array.isArray(req.body.items) || !req.body.items.length || req.body.items.length > 30) return reply(res, 400, { error: 'Your cart is empty or has too many line items.' });

  const lines = [];
  for (const line of req.body.items) {
    const unitPrice = PRODUCTS[line.name];
    const quantity = Number(line.quantity);
    if (unitPrice === undefined || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      return reply(res, 400, { error: 'A product or quantity in your cart is not valid.' });
    }
    lines.push({ name: line.name, quantity, unit_price: unitPrice, line_total: unitPrice * quantity });
  }
  const itemsTotal = lines.reduce((sum, line) => sum + line.line_total, 0);
  if (lines.some(line => line.name === 'A Note From Jonathan') && itemsTotal <= 200) {
    return reply(res, 400, { error: 'The free note is available with orders over $200.' });
  }
  if (lines.some(line => line.name === 'A Note From Jonathan' && line.quantity !== 1)) {
    return reply(res, 400, { error: 'Only one free note is included with each qualifying order.' });
  }
  const amount = itemsTotal + SHIPPING_FEE;
  if (!Number.isFinite(amount) || amount <= 0) return reply(res, 400, { error: 'The order total is not valid.' });

  const txRef = `roumie-${crypto.randomUUID()}`;
  const order = {
    tx_ref: txRef,
    payment_status: 'pending_payment',
    currency: CURRENCY,
    amount,
    items: lines,
    customer_name: customer.name.trim(),
    customer_email: customer.email.trim(),
    customer_phone: customer.phone.trim(),
    shipping_address: {
      country: customer.country.trim(),
      address: customer.address.trim(),
      city: customer.city.trim(),
      state: customer.state.trim(),
      postal_code: String(customer.postalCode || '').trim(),
      delivery_note: String(customer.deliveryNote || '').trim()
    }
  };

  let storedOrder;
  try {
    [storedOrder] = await supabaseRequest('orders?select=id,tx_ref,amount,currency', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(order)
    });
  } catch (error) {
    console.error('Supabase order insert failed:', error.message);
    return reply(res, 502, { error: 'We could not save your order details. Please try again.' });
  }

  const requestUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const siteUrl = (process.env.SITE_URL || requestUrl.origin).replace(/\/$/, '');
  let flwResponse;
  try {
    flwResponse = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: String(amount),
        currency: CURRENCY,
        redirect_url: `${siteUrl}/?payment=return`,
        customer: { email: customer.email.trim(), name: customer.name.trim(), phonenumber: customer.phone.trim() },
        meta: { order_id: storedOrder.id },
        customizations: { title: 'Jonathan Roumie Shop', description: 'Merchandise order' }
      })
    });
  } catch {
    await supabaseRequest(`orders?id=eq.${encodeURIComponent(storedOrder.id)}`, {
      method: 'PATCH', body: JSON.stringify({ payment_status: 'payment_setup_failed' })
    }).catch(() => {});
    return reply(res, 502, { error: 'Flutterwave could not be reached. Please try again.' });
  }
  const flw = await flwResponse.json().catch(() => ({}));
  if (!flwResponse.ok || flw.status !== 'success' || !flw.data?.link) {
    console.error('Flutterwave checkout setup failed:', flw.message || flwResponse.status);
    await supabaseRequest(`orders?id=eq.${encodeURIComponent(storedOrder.id)}`, {
      method: 'PATCH', body: JSON.stringify({ payment_status: 'payment_setup_failed' })
    }).catch(() => {});
    return reply(res, 502, { error: 'Flutterwave could not prepare payment for this order. Please try again.' });
  }
  await supabaseRequest(`orders?id=eq.${encodeURIComponent(storedOrder.id)}`, {
    method: 'PATCH', body: JSON.stringify({ payment_link: flw.data.link })
  }).catch(error => console.error('Order link update failed:', error.message));
  return reply(res, 200, { paymentLink: flw.data.link, txRef, amount, currency: CURRENCY });
};
