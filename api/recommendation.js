async function supabaseRequest(path, options = {}) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  const base = process.env.SUPABASE_URL;
  if (!secret || !base) throw new Error('Recommendation storage is not configured.');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...options.headers }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || 'Recommendation could not be saved.');
    error.status = response.status;
    throw error;
  }
  return body;
}

module.exports = async function recommendation(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const txRef = typeof req.body?.tx_ref === 'string' ? req.body.tx_ref : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!/^roumie-[0-9a-f-]{36}$/i.test(txRef)) return res.status(400).json({ error: 'The order reference is not valid.' });
  if (message.length < 5 || message.length > 1200) return res.status(400).json({ error: 'Please enter a message between 5 and 1,200 characters.' });

  try {
    const orders = await supabaseRequest(`orders?tx_ref=eq.${encodeURIComponent(txRef)}&payment_status=eq.paid&select=id,tx_ref`);
    const order = orders?.[0];
    if (!order) return res.status(403).json({ error: 'Recommendations are available after a confirmed shop payment.' });

    const [saved] = await supabaseRequest('customer_recommendations?select=id,created_at', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ order_id: order.id, message })
    });

    let notificationSent = false;
    const recipient = process.env.INQUIRY_NOTIFICATION_EMAIL;
    const resendKey = process.env.RESEND_API_KEY;
    const sender = process.env.RESEND_FROM_EMAIL;
    if (recipient && resendKey && sender) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: sender,
            to: [recipient],
            subject: `Shop recommendation received (${txRef})`,
            text: `A customer shared a recommendation after order ${txRef}.\n\n${message}`,
            html: `<div style="font-family:Arial,sans-serif;color:#24231f;max-width:600px;margin:auto"><h1>Customer recommendation</h1><p><strong>Order reference:</strong> ${txRef}</p><blockquote style="white-space:pre-wrap">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</blockquote></div>`
          })
        });
        notificationSent = response.ok;
        if (!notificationSent) console.error('Recommendation notification failed with status:', response.status);
      } catch (error) { console.error('Recommendation notification failed:', error.message); }
    }
    return res.status(200).json({ saved: true, notificationSent, createdAt: saved?.created_at });
  } catch (error) {
    if (error.status === 409 || error.code === '23505') return res.status(409).json({ error: 'A recommendation has already been sent for this order.' });
    console.error('Recommendation could not be saved:', error.message);
    return res.status(502).json({ error: 'We could not save your message just now. Please try again.' });
  }
};
