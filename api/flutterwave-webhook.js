const crypto = require('node:crypto');

function safeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function supabaseRequest(path, options = {}) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const base = process.env.SUPABASE_URL;
  if (!secret || !base) throw new Error('Order storage is not configured.');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...options.headers }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || 'Order storage request failed.');
  return body;
}

module.exports = async function webhook(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const configuredHash = process.env.FLW_WEBHOOK_SECRET_HASH;
  if (!configuredHash || !safeEquals(req.headers['verif-hash'], configuredHash)) return res.status(401).end();

  const event = req.body || {};
  const data = event.data || {};
  if (event.event !== 'charge.completed' || !data.id || !data.tx_ref) return res.status(200).end();

  try {
    const rows = await supabaseRequest(`orders?tx_ref=eq.${encodeURIComponent(data.tx_ref)}&select=id,tx_ref,amount,currency,payment_status`);
    const order = rows?.[0];
    if (!order || order.payment_status === 'paid') return res.status(200).end();

    const verifyResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(data.id)}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });
    const verified = await verifyResponse.json().catch(() => ({}));
    const payment = verified.data || {};
    const isPaid = verifyResponse.ok && verified.status === 'success' &&
      payment.status === 'successful' && payment.tx_ref === order.tx_ref &&
      payment.currency === order.currency && Number(payment.amount) >= Number(order.amount);
    if (!isPaid) return res.status(200).end();

    await supabaseRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ payment_status: 'paid', flutterwave_transaction_id: String(data.id), paid_at: new Date().toISOString() })
    });
    return res.status(200).end();
  } catch (error) {
    console.error('Flutterwave webhook processing failed:', error.message);
    return res.status(500).end();
  }
};
