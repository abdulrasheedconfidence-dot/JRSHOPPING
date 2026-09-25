const ALLOWED_KINDS = {
  meet_greet: 'Meet & greet',
  zoom_course: 'Live Zoom course'
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function supabaseRequest(path, options = {}) {
  const base = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secret) throw new Error('Inquiry storage is not configured.');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', ...options.headers }
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || 'Inquiry storage request failed.');
  return result;
}

module.exports = async function inquiry(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const input = req.body || {};
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
  const email = typeof input.email === 'string' ? input.email.trim().slice(0, 254) : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim().slice(0, 60) : '';
  const message = typeof input.message === 'string' ? input.message.trim().slice(0, 1200) : '';
  const kind = ALLOWED_KINDS[input.kind];
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !kind) {
    return res.status(400).json({ error: 'Please enter your name, a valid email and the experience you are asking about.' });
  }

  let inquiryRow;
  try {
    [inquiryRow] = await supabaseRequest('booking_inquiries?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        name,
        email,
        phone: phone || null,
        inquiry_type: input.kind,
        message: message || null,
        status: 'new'
      })
    });
  } catch (error) {
    console.error('Booking inquiry could not be saved:', error.message);
    return res.status(502).json({ error: 'We could not save your request just now. Please try again.' });
  }

  const recipient = process.env.INQUIRY_NOTIFICATION_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  const sender = process.env.RESEND_FROM_EMAIL;
  let notificationSent = false;
  if (recipient && resendKey && sender) {
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || 'Not provided');
    const safeMessage = escapeHtml(message || 'No additional message.').replace(/\n/g, '<br>');
    try {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: sender,
          to: [recipient],
          reply_to: email,
          subject: `New ${kind} availability request`,
          text: `New ${kind} request\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\n\nMessage:\n${message || 'No additional message.'}`,
          html: `<h2>New ${escapeHtml(kind)} request</h2><p><strong>Name:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Phone:</strong> ${safePhone}</p><p><strong>Message:</strong><br>${safeMessage}</p><p>Inquiry ID: ${escapeHtml(inquiryRow.id)}</p>`
        })
      });
      notificationSent = emailResponse.ok;
      if (notificationSent) {
        await supabaseRequest(`booking_inquiries?id=eq.${encodeURIComponent(inquiryRow.id)}`, {
          method: 'PATCH', body: JSON.stringify({ email_notification_sent: true })
        });
      } else {
        console.error('Booking inquiry email notification failed with status:', emailResponse.status);
      }
    } catch (error) {
      console.error('Booking inquiry email notification failed:', error.message);
    }
  }

  return res.status(200).json({ saved: true, notificationSent });
};
