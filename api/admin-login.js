const { configured, safeEqual, setSessionCookie, clearSessionCookie } = require('../admin-auth');

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function reply(res, status, body) { return res.status(status).json(body); }

module.exports = async function adminLogin(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed.' });
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return reply(res, 403, { error: 'Request not allowed.' });
  const action = req.body?.action;
  if (action === 'logout') {
    clearSessionCookie(res);
    return reply(res, 200, { ok: true });
  }
  if (!configured()) return reply(res, 503, { error: 'Admin access is not configured. Add ADMIN_PASSWORD and a 32+ character ADMIN_SESSION_SECRET to the deployment environment.' });
  const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const record = attempts.get(ip);
  if (record && now - record.startedAt < WINDOW_MS && record.count >= MAX_ATTEMPTS) return reply(res, 429, { error: 'Too many attempts. Wait 15 minutes and try again.' });
  if (!record || now - record.startedAt >= WINDOW_MS) attempts.set(ip, { startedAt: now, count: 0 });
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqual(password, process.env.ADMIN_PASSWORD)) {
    attempts.get(ip).count += 1;
    return reply(res, 401, { error: 'The password was not recognized.' });
  }
  attempts.delete(ip);
  setSessionCookie(res);
  return reply(res, 200, { ok: true });
};
