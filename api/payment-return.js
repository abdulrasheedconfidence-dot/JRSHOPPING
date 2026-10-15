async function supabaseRequest(path, options = {}) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const base = process.env.SUPABASE_URL;
  if (!secret || !base) throw new Error('Order storage is not configured.');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...options.headers }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || 'Order lookup failed.');
  return body;
}

module.exports = async function paymentReturn(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const input = req.body || {};
  const txRef = typeof input.tx_ref === 'string' ? input.tx_ref : '';
  const transactionId = String(input.transaction_id || '');
  const gatewayStatus = typeof input.status === 'string' ? input.status.toLowerCase() : '';
  if (!/^roumie-[0-9a-f-]{36}$/i.test(txRef)) return res.status(400).json({ error: 'The order reference is not valid.' });

  try {
    const rows = await supabaseRequest(`orders?tx_ref=eq.${encodeURIComponent(txRef)}&select=id,tx_ref,amount,currency,payment_status`);
    const order = rows?.[0];
    if (!order) return res.status(404).json({ status: 'not_found' });
    if (order.payment_status === 'paid') return res.status(200).json({ status: 'paid', tx_ref: order.tx_ref });
    if (gatewayStatus !== 'successful' || !/^\d+$/.test(transactionId) || !process.env.FLW_SECRET_KEY) {
      return res.status(200).json({ status: gatewayStatus === 'failed' || gatewayStatus === 'cancelled' ? 'not_paid' : 'pending' });
    }

    const verifyResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });
    const verification = await verifyResponse.json().catch(() => ({}));
    const payment = verification.data || {};
    const verified = verifyResponse.ok && verification.status === 'success' && payment.status === 'successful' &&
      payment.tx_ref === order.tx_ref && payment.currency === order.currency && Number(payment.amount) >= Number(order.amount);
    if (!verified) return res.status(200).json({ status: 'pending' });

    await supabaseRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ payment_status: 'paid', flutterwave_transaction_id: transactionId, paid_at: new Date().toISOString() })
    });
    return res.status(200).json({ status: 'paid', tx_ref: order.tx_ref });
  } catch (error) {
    console.error('Payment return could not be verified:', error.message);
    return res.status(502).json({ error: 'We could not confirm this payment yet.' });
  }
};
