// ShipCheck egress proxy: the ONLY way out of the sandbox network.
// Port 3128: HTTP proxy + CONNECT tunnels. Port 8080: admin API for the api service.
import http from 'node:http';
import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { isAllowed } from './allowlist.js';
import { resolvePublic } from './ipguard.js';

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 3128);
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 8080);
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? '';
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://api:4000';

if (INTERNAL_TOKEN.length < 32) {
  console.error('INTERNAL_TOKEN must be set (at least 32 characters)');
  process.exit(1);
}

// token -> { jobId, allowDomains: Set<string>, blockCounts: { [host]: number } }
const jobs = new Map();

// A crash would wipe every registered job token, so log stray socket errors instead of exiting.
process.on('uncaughtException', (err) => console.error('Uncaught error (proxy keeps running):', err.message));

function sameToken(given) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(INTERNAL_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function jobFromAuth(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  const [token] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  return jobs.get(token) ?? null;
}

// Counts every block; reports only the first block per host to the api (live red event).
function block(job, target, reason) {
  const first = !job.blockCounts[target];
  job.blockCounts[target] = (job.blockCounts[target] ?? 0) + 1;
  console.log(`[blocked] job=${job.jobId} target=${target} reason=${reason}`);
  if (!first) return;
  fetch(`${API_INTERNAL_URL}/internal/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
    body: JSON.stringify({ jobId: job.jobId, layer: 'network', target, reason }),
    signal: AbortSignal.timeout(3000),
  }).catch((err) => console.error('Could not report the block to the api:', err.message));
}

async function decide(job, host, port) {
  if (port !== 80 && port !== 443) return { ok: false, reason: `port ${port} is not allowed` };
  if (!isAllowed(job, host)) return { ok: false, reason: "host is not in this job's allowlist" };
  try {
    return { ok: true, ip: await resolvePublic(host) };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// Plain http:// requests (absolute URL in the request line).
const proxy = http.createServer(async (req, res) => {
  const job = jobFromAuth(req.headers['proxy-authorization']);
  if (!job) {
    res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="shipcheck"' });
    return res.end();
  }
  let url;
  try {
    url = new URL(req.url);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (url.protocol !== 'http:') {
    res.writeHead(400);
    return res.end('Only http:// requests are proxied here');
  }
  const port = Number(url.port || 80);
  const verdict = await decide(job, url.hostname, port);
  if (!verdict.ok) {
    block(job, url.hostname, verdict.reason);
    res.writeHead(403);
    return res.end('Blocked by the ShipCheck sandbox');
  }
  const headers = { ...req.headers, host: url.host };
  delete headers['proxy-authorization'];
  delete headers['proxy-connection'];
  const upstream = http.request(
    { host: verdict.ip, port, method: req.method, path: `${url.pathname}${url.search}`, headers, timeout: 20000 },
    (up) => {
      up.on('error', () => res.destroy());
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('timeout', () => upstream.destroy(new Error('upstream timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.on('error', () => upstream.destroy());
  req.pipe(upstream);
});

// HTTPS and WebSockets: CONNECT host:port tunnels.
proxy.on('connect', async (req, clientSocket, head) => {
  clientSocket.on('error', () => {});
  const job = jobFromAuth(req.headers['proxy-authorization']);
  if (!job) {
    clientSocket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="shipcheck"\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  const idx = req.url.lastIndexOf(':');
  const host = (idx > 0 ? req.url.slice(0, idx) : req.url).replace(/^\[|\]$/g, '');
  const port = idx > 0 ? Number(req.url.slice(idx + 1)) : 443;
  const verdict = await decide(job, host, port);
  if (!verdict.ok) {
    block(job, host, verdict.reason);
    clientSocket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  const upstream = net.connect(port, verdict.ip, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head?.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.setTimeout(60000, () => upstream.destroy());
  upstream.on('error', () => clientSocket.destroy());
  clientSocket.on('close', () => upstream.destroy());
});

// Admin API: only the api service knows INTERNAL_TOKEN.
const admin = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    return res.end('ok');
  }
  if (!sameToken(req.headers['x-internal-token'])) {
    res.writeHead(401);
    return res.end();
  }
  if (req.method === 'POST' && req.url === '/jobs') {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10000) req.destroy();
    });
    req.on('end', () => {
      try {
        const { token, jobId, allowDomains } = JSON.parse(raw);
        if (typeof token !== 'string' || !/^[0-9a-f]{32,}$/.test(token) || typeof jobId !== 'string' || !Array.isArray(allowDomains)) {
          throw new Error('bad body');
        }
        jobs.set(token, { jobId, allowDomains: new Set(allowDomains.map((d) => String(d).toLowerCase())), blockCounts: {} });
        res.writeHead(204);
        res.end();
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  const match = req.method === 'DELETE' ? req.url.match(/^\/jobs\/([0-9a-f]+)$/) : null;
  if (match) {
    const job = jobs.get(match[1]);
    jobs.delete(match[1]);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ counts: job?.blockCounts ?? {} }));
  }
  res.writeHead(404);
  res.end();
});

proxy.listen(PROXY_PORT, () => console.log(`egress proxy listening on :${PROXY_PORT}`));
admin.listen(ADMIN_PORT, () => console.log(`proxy admin listening on :${ADMIN_PORT}`));
