const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const PORT = Number(process.env.PORT || 8080);
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;
const handlers = {
  '/api/checkout': require('./api/checkout'),
  '/api/ticket-checkout': require('./api/ticket-checkout'),
  '/api/flutterwave-webhook': require('./api/flutterwave-webhook'),
  '/api/inquiry': require('./api/inquiry')
};
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function dispatchApi(request, response, handler) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 20000) {
      response.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
      return response.end(JSON.stringify({ error: 'Request body is too large.' }));
    }
  }
  try { request.body = raw ? JSON.parse(raw) : {}; }
  catch {
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ error: 'Invalid JSON request.' }));
  }
  let statusCode = 200;
  const responseAdapter = {
    status(code) { statusCode = code; return this; },
    json(body) {
      response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
      return this;
    },
    end() { response.writeHead(statusCode); response.end(); return this; }
  };
  return handler(request, responseAdapter);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, SITE_URL);
  if (handlers[url.pathname] && request.method === 'POST') return dispatchApi(request, response, handlers[url.pathname]);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405); return response.end('Method not allowed');
  }
  let requestedPath;
  try { requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
  catch { response.writeHead(400); return response.end('Bad request'); }
  const filePath = path.resolve(ROOT, `.${requestedPath}`);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    response.writeHead(403); return response.end('Forbidden');
  }
  fs.readFile(filePath, (error, content) => {
    if (error) { response.writeHead(404); return response.end('Not found'); }
    response.writeHead(200, { 'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  });
});

server.listen(PORT, () => console.log(`Jonathan Roumie shop ready at ${SITE_URL}`));
