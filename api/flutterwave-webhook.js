const crypto = require('node:crypto');

function safeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
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

async function sendResendEmail({ order, type, to, subject, html, text, replyTo }) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !to) throw new Error('Order email settings are not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${type}/${order.id}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend ${type} failed (${response.status}): ${body.message || 'email could not be sent'}`);
}

async function markNotificationSent(table, order, column) {
  await supabaseRequest(`${table}?id=eq.${encodeURIComponent(order.id)}`, {
    method: 'PATCH', body: JSON.stringify({ [column]: true })
  });
  order[column] = true;
}

async function sendTicketOrderEmails(order) {
  const venue = 'Peoria Civic Center, 201 Southwest Jefferson Avenue, Peoria, Illinois 61602, USA';
  const items = order.ticket_items || {};
  const lines = [];
  if (Number(items.general_admission) > 0) lines.push(`${Number(items.general_admission)} × General Admission — $${Number(items.general_admission) * 250}`);
  if (Number(items.vip_experience) > 0) lines.push(`${Number(items.vip_experience)} × VIP Experience — $${Number(items.vip_experience) * 1000}`);
  const orderLines = lines.join('\n');
  const safeName = escapeHtml(order.customer_name);
  const safeRef = escapeHtml(order.tx_ref);
  const safeLines = lines.map(line => `<li>${escapeHtml(line)}</li>`).join('');
  const safeVenue = escapeHtml(venue);
  const total = new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency || 'USD' }).format(Number(order.amount));
  const emailHtml = `<div style="font-family:Arial,sans-serif;color:#24231f;max-width:600px;margin:auto"><p style="letter-spacing:.12em;font-size:12px">THE SHEEN AWARDS</p><h1 style="font-family:Georgia,serif">Your payment is confirmed, ${safeName}.</h1><p>Jonathan Roumie is hosting and presenting the awards as Special Guest of Honor.</p><p><strong>Order reference:</strong> ${safeRef}</p><ul>${safeLines}</ul><p><strong>Total paid:</strong> ${total}</p><p><strong>When:</strong> Friday, September 25, 2026. VIP reception 5:00 p.m.; general reception 6:00 p.m.; dinner 6:45 p.m.; show 7:30 p.m. Central Time.</p><p><strong>Where:</strong> ${safeVenue}</p><p>This email confirms your paid ticket order. Keep the order reference for event follow-up.</p></div>`;
  const emailText = `The Sheen Awards — payment confirmed\n\nHello ${order.customer_name},\nOrder reference: ${order.tx_ref}\n${orderLines}\nTotal paid: ${total}\n\nFriday, September 25, 2026. VIP reception 5:00 p.m.; general reception 6:00 p.m.; dinner 6:45 p.m.; show 7:30 p.m. Central Time.\nVenue: ${venue}\n\nKeep this order reference for event follow-up.`;

  if (!order.customer_receipt_sent) {
    await sendResendEmail({ order, type: 'sheen-customer-receipt', to: order.customer_email, subject: `Your Sheen Awards ticket order is confirmed (${order.tx_ref})`, html: emailHtml, text: emailText });
    await markNotificationSent('event_ticket_orders', order, 'customer_receipt_sent');
  }
  if (!order.owner_notification_sent) {
    const owner = process.env.INQUIRY_NOTIFICATION_EMAIL;
    if (!owner) throw new Error('INQUIRY_NOTIFICATION_EMAIL is not configured.');
    const details = `<p><strong>Order:</strong> ${safeRef}<br><strong>Customer:</strong> ${safeName}<br><strong>Email:</strong> ${escapeHtml(order.customer_email)}<br><strong>Phone:</strong> ${escapeHtml(order.customer_phone)}<br><strong>Total:</strong> ${total}</p><ul>${safeLines}</ul>`;
    await sendResendEmail({ order, type: 'sheen-owner-order-notice', to: owner, replyTo: order.customer_email, subject: `Paid Sheen Awards ticket order: ${order.tx_ref} (${total})`, html: `<div style="font-family:Arial,sans-serif;color:#24231f"><h1>New paid Sheen Awards ticket order</h1>${details}</div>`, text: `New paid Sheen Awards ticket order\nOrder: ${order.tx_ref}\nCustomer: ${order.customer_name}\nEmail: ${order.customer_email}\nPhone: ${order.customer_phone}\nTotal: ${total}\n${orderLines}` });
    await markNotificationSent('event_ticket_orders', order, 'owner_notification_sent');
  }
}

async function verifySuccessfulPayment(data, order) {
  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(data.id)}/verify`, {
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
  });
  const result = await response.json().catch(() => ({}));
  const payment = result.data || {};
  return response.ok && result.status === 'success' && payment.status === 'successful' &&
    payment.tx_ref === order.tx_ref && payment.currency === order.currency && Number(payment.amount) >= Number(order.amount);
}

async function sendOrderEmails(order) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.INQUIRY_NOTIFICATION_EMAIL) {
    throw new Error('Order email settings are missing. Configure RESEND_API_KEY, RESEND_FROM_EMAIL and INQUIRY_NOTIFICATION_EMAIL.');
  }

  const currency = order.currency || 'USD';
  const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
  const safeName = escapeHtml(order.customer_name);
  const safeRef = escapeHtml(order.tx_ref);
  const lines = Array.isArray(order.items) ? order.items : [];
  const itemRows = lines.map(item => `<tr><td style="padding:10px;border-bottom:1px solid #eee">${escapeHtml(item.name)} × ${Number(item.quantity)}</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right">${money(item.line_total)}</td></tr>`).join('');
  const itemText = lines.map(item => `${item.name} × ${Number(item.quantity)} — ${money(item.line_total)}`).join('\n');
  const total = money(order.amount);
  const address = order.shipping_address || {};
  const addressText = [address.address, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(', ');
  const safeAddress = escapeHtml(addressText);

  if (!order.customer_receipt_sent) {
    await sendResendEmail({
      order,
      type: 'customer-receipt',
      to: order.customer_email,
      subject: `Your Jonathan Roumie Shop order is confirmed (${order.tx_ref})`,
      html: `<div style="font-family:Arial,sans-serif;color:#24231f;max-width:600px;margin:auto"><p style="letter-spacing:.12em;font-size:12px">JONATHAN ROUMIE SHOP</p><h1 style="font-family:Georgia,serif">Thank you, ${safeName}.</h1><p>Your payment is confirmed. We’re getting your order ready.</p><p><strong>Order reference:</strong> ${safeRef}</p><table style="width:100%;border-collapse:collapse">${itemRows}<tr><td style="padding:12px 10px"><strong>Total paid</strong></td><td style="padding:12px 10px;text-align:right"><strong>${total}</strong></td></tr></table><p><strong>Shipping to</strong><br>${safeAddress || 'Address provided at checkout'}</p><p>We’ll follow up with delivery updates when they’re available.</p></div>`,
      text: `Thank you, ${order.customer_name}. Your payment is confirmed.\n\nOrder reference: ${order.tx_ref}\n${itemText}\n\nTotal paid: ${total}\nShipping to: ${addressText || 'Address provided at checkout'}\n\nWe’ll follow up with delivery updates when they’re available.`
    });
    await markNotificationSent('orders', order, 'customer_receipt_sent');
  }

  if (!order.owner_notification_sent) {
    const customerEmail = escapeHtml(order.customer_email);
    const phone = escapeHtml(order.customer_phone || 'Not provided');
    const safeAddressHtml = safeAddress || 'No shipping address saved';
    await sendResendEmail({
      order,
      type: 'owner-order-notice',
      to: process.env.INQUIRY_NOTIFICATION_EMAIL,
      subject: `Paid order received: ${order.tx_ref} (${total})`,
      html: `<div style="font-family:Arial,sans-serif;color:#24231f;max-width:650px;margin:auto"><h1 style="font-family:Georgia,serif">New paid order</h1><p><strong>Order:</strong> ${safeRef}<br><strong>Total:</strong> ${total}</p><table style="width:100%;border-collapse:collapse">${itemRows}</table><h2>Customer and delivery</h2><p><strong>Name:</strong> ${safeName}<br><strong>Email:</strong> ${customerEmail}<br><strong>Phone:</strong> ${phone}<br><strong>Address:</strong> ${safeAddressHtml}</p>${address.delivery_note ? `<p><strong>Delivery note:</strong> ${escapeHtml(address.delivery_note)}</p>` : ''}</div>`,
      text: `New paid order\n\nOrder: ${order.tx_ref}\nTotal: ${total}\n${itemText}\n\nCustomer: ${order.customer_name}\nEmail: ${order.customer_email}\nPhone: ${order.customer_phone || 'Not provided'}\nShipping address: ${addressText || 'No shipping address saved'}${address.delivery_note ? `\nDelivery note: ${address.delivery_note}` : ''}`
    });
    await markNotificationSent('orders', order, 'owner_notification_sent');
  }
}

module.exports = async function webhook(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const configuredHash = process.env.FLW_WEBHOOK_SECRET_HASH;
  if (!configuredHash || !safeEquals(req.headers['verif-hash'], configuredHash)) return res.status(401).end();

  const event = req.body || {};
  const data = event.data || {};
  if (event.event !== 'charge.completed' || !data.id || !data.tx_ref) return res.status(200).end();

  try {
    const rows = await supabaseRequest(`orders?tx_ref=eq.${encodeURIComponent(data.tx_ref)}&select=id,tx_ref,amount,currency,payment_status,items,customer_name,customer_email,customer_phone,shipping_address,customer_receipt_sent,owner_notification_sent`);
    const order = rows?.[0];
    if (order) {
      if (order.payment_status !== 'paid') {
        if (!await verifySuccessfulPayment(data, order)) return res.status(200).end();
        await supabaseRequest(`orders?id=eq.${encodeURIComponent(order.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ payment_status: 'paid', flutterwave_transaction_id: String(data.id), paid_at: new Date().toISOString() })
        });
        order.payment_status = 'paid';
      }
      await sendOrderEmails(order);
      return res.status(200).end();
    }

    const ticketRows = await supabaseRequest(`event_ticket_orders?tx_ref=eq.${encodeURIComponent(data.tx_ref)}&select=id,tx_ref,amount,currency,payment_status,ticket_items,customer_name,customer_email,customer_phone,customer_receipt_sent,owner_notification_sent`);
    const ticketOrder = ticketRows?.[0];
    if (!ticketOrder) return res.status(200).end();
    if (ticketOrder.payment_status !== 'paid') {
      if (!await verifySuccessfulPayment(data, ticketOrder)) return res.status(200).end();
      await supabaseRequest(`event_ticket_orders?id=eq.${encodeURIComponent(ticketOrder.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: 'paid', flutterwave_transaction_id: String(data.id), paid_at: new Date().toISOString() })
      });
      ticketOrder.payment_status = 'paid';
    }
    await sendTicketOrderEmails(ticketOrder);
    return res.status(200).end();
  } catch (error) {
    console.error('Flutterwave webhook processing failed:', error.message);
    return res.status(500).end();
  }
};
