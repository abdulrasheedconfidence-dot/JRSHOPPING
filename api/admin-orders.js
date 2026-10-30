const { isAuthenticated, configured } = require('../admin-auth');

function reply(res, status, body) { return res.status(status).json(body); }

async function getRows(table, columns) {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret) throw new Error('Order storage is not configured.');
  const query = new URLSearchParams({ select: columns, order: 'created_at.desc' });
  const rows = [];
  const pageSize = 1000;
  for (let start = 0; ; start += pageSize) {
    const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${table}?${query}`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Range-Unit': 'items', Range: `${start}-${start + pageSize - 1}` }
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result)) throw new Error('Could not retrieve order records.');
    rows.push(...result);
    if (result.length < pageSize) break;
  }
  return rows;
}

module.exports = async function adminOrders(req, res) {
  if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed.' });
  if (!configured()) return reply(res, 503, { error: 'Admin access is not configured.' });
  if (!isAuthenticated(req)) return reply(res, 401, { error: 'Please sign in to view transactions.' });
  try {
    const [orders, tickets] = await Promise.all([
      getRows('orders', 'id,tx_ref,payment_status,currency,amount,items,customer_name,customer_email,customer_phone,flutterwave_transaction_id,paid_at,created_at'),
      getRows('event_ticket_orders', 'id,tx_ref,event_slug,payment_status,currency,amount,ticket_items,customer_name,customer_email,customer_phone,flutterwave_transaction_id,paid_at,created_at')
    ]);
    const transactions = [
      ...orders.map(row => ({ ...row, kind: 'shop', entries: Array.isArray(row.items) ? row.items : [] })),
      ...tickets.map(row => ({ ...row, kind: 'ticket', entries: row.ticket_items && typeof row.ticket_items === 'object' ? Object.entries(row.ticket_items).map(([name, quantity]) => ({ name, quantity })) : [] }))
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return reply(res, 200, { transactions });
  } catch (error) {
    console.error('Admin transaction list failed:', error.message);
    return reply(res, 502, { error: 'Transactions could not be loaded. Check the Supabase connection and migrations.' });
  }
};
