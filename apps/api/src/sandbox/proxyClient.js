import { config } from '../config.js';

async function call(method, path, body) {
  const res = await fetch(`${config.proxyAdminUrl}${path}`, {
    method,
    headers: { 'x-internal-token': config.internalToken, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Proxy admin ${method} ${path} answered HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export function registerJob({ token, jobId, allowDomains }) {
  return call('POST', '/jobs', { token, jobId, allowDomains });
}
export async function unregisterJob(token) {
  const body = await call('DELETE', `/jobs/${token}`);
  return body?.counts ?? {};
}
export async function proxyHealthy() {
  try { const res = await fetch(`${config.proxyAdminUrl}/health`, { signal: AbortSignal.timeout(2000) }); return res.ok; }
  catch { return false; }
}
