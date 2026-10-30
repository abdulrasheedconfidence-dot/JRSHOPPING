const crypto = require('node:crypto');

const COOKIE_NAME = 'jr_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;

function configured() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 32);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signature(value) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(value).digest('base64url');
}

function makeToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

function isAuthenticated(req) {
  if (!configured()) return false;
  const cookies = String(req.headers?.cookie || '').split(';').map(part => part.trim());
  const token = cookies.find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!token) return false;
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra || !safeEqual(signature(payload), suppliedSignature)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Math.floor(Date.now() / 1000); }
  catch { return false; }
}

function setSessionCookie(res) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

module.exports = { COOKIE_NAME, configured, safeEqual, isAuthenticated, setSessionCookie, clearSessionCookie };
