const crypto = require('node:crypto');

const PRICES = { general_admission: 250, vip_experience: 1000 };
const CURRENCY = process.env.SHOP_CURRENCY || 'USD';
const EVENT_CLOSES_AT = Date.parse('2026-09-25T19:30:00-05:00');

function reply(res, status, body) {
  return res.status(status).json(body);
}

async function supabaseRequest(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret) throw new Error('Ticket orders are not configured in Supabase.');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...options.headers }
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || 'Ticket order could not be saved.');
  return result;
}

module.exports = async function ticketCheckout(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (!process.env.FLW_SECRET_KEY) return reply(res, 503, { error: 'Secure checkout is not configured yet. Please contact the event organizer.' });
  if (Date.now() >= EVENT_CLOSES_AT) return reply(res, 410, { error: 'Ticket checkout for this event has closed.' });

  const input = req.body || {};
  const customer = input.customer || {};
  const name = typeof customer.name === 'string' ? customer.name.trim().slice(0, 120) : '';
  const email = typeof customer.email === 'string' ? customer.email.trim().slice(0, 254) : '';
  const phone = typeof customer.phone === 'string' ? customer.phone.trim().slice(0, 60) : '';
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone) {
    return reply(res, 400, { error: 'Please enter your name, a valid email and phone number.' });
  }

  const quantities = {};
  for (const ticketType of Object.keys(PRICES)) {
    const quantity = Number(input.ticketItems?.[ticketType] || 0);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 50) {
      return reply(res, 400, { error: 'Ticket quantities must be whole numbers from 0 to 50.' });
    }
    quantities[ticketType] = quantity;
  }
  if (!quantities.general_admission && !quantities.vip_experience) {
    return reply(res, 400, { error: 'Choose at least one ticket.' });
  }

  const amount = Object.entries(quantities).reduce((sum, [ticketType, quantity]) => sum + PRICES[ticketType] * quantity, 0);
  const txRef = `sheen-${crypto.randomUUID()}`;
  let orderId;
  try {
    orderId = await supabaseRequest('rpc/reserve_sheen_ticket_order', {
      method: 'POST',
      body: JSON.stringify({
        p_tx_ref: txRef,
        p_currency: CURRENCY,
        p_amount: amount,
        p_ticket_items: quantities,
        p_customer_name: name,
        p_customer_email: email,
        p_customer_phone: phone,
        p_general_limit: 0,
        p_vip_limit: 0
      })
    });
    if (Array.isArray(orderId)) orderId = orderId[0];
  } catch (error) {
    console.error('Sheen ticket reservation failed:', error.message);
    const inventoryError = /not enough/i.test(error.message);
    return reply(res, inventoryError ? 409 : 502, { error: inventoryError ? error.message : 'We could not save your ticket order. Please try again.' });
  }

  const requestUrl = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const siteUrl = (process.env.SITE_URL || requestUrl.origin).replace(/\/$/, '');
  let paymentResponse;
  try {
    paymentResponse = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: String(amount),
        currency: CURRENCY,
        redirect_url: `${siteUrl}/tickets.html?payment=return`,
        customer: { email, name, phonenumber: phone },
        meta: { event_ticket_order_id: orderId, event: 'sheen-awards-2026' },
        customizations: { title: 'The Sheen Awards', description: 'Sheen Awards Gala tickets with Jonathan Roumie' }
      })
    });
  } catch {
    await supabaseRequest(`event_ticket_orders?id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', body: JSON.stringify({ payment_status: 'payment_setup_failed' }) }).catch(() => {});
    return reply(res, 502, { error: 'Flutterwave could not be reached. Please try again.' });
  }

  const flutterwave = await paymentResponse.json().catch(() => ({}));
  if (!paymentResponse.ok || flutterwave.status !== 'success' || !flutterwave.data?.link) {
    console.error('Flutterwave ticket checkout failed:', flutterwave.message || paymentResponse.status);
    await supabaseRequest(`event_ticket_orders?id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', body: JSON.stringify({ payment_status: 'payment_setup_failed' }) }).catch(() => {});
    return reply(res, 502, { error: 'Flutterwave could not prepare payment. Please try again.' });
  }

  await supabaseRequest(`event_ticket_orders?id=eq.${encodeURIComponent(orderId)}`, { method: 'PATCH', body: JSON.stringify({ payment_link: flutterwave.data.link }) }).catch(error => console.error('Ticket payment link update failed:', error.message));
  return reply(res, 200, { paymentLink: flutterwave.data.link, total: amount, currency: CURRENCY });
};
