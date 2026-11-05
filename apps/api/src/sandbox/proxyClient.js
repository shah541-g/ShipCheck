import { config } from '../config.js';

const TOKEN_RE = /^[a-f0-9]{64}$/i;

export function createProxyClient({
  adminUrl = config.proxyAdminUrl,
  internalToken = config.internalToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000
} = {}) {
  async function call(method, path, body) {
    if (!adminUrl || !internalToken) throw new Error('Egress proxy administration is not configured');
    if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for egress proxy administration');
    const base = new URL(adminUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
      throw new Error('Egress proxy administration URL is invalid');
    }

    let response;
    try {
      response = await fetchImpl(new URL(path, base), {
        method,
        headers: {
          'x-internal-token': internalToken,
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw new Error('Egress proxy administration is unavailable');
    }
    if (!response.ok) throw new Error(`Egress proxy administration returned HTTP ${response.status}`);
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch { throw new Error('Egress proxy administration returned invalid JSON'); }
  }

  return {
    async registerJob({ token, jobId, allowDomains }) {
      if (!TOKEN_RE.test(token || '') || !/^[a-z0-9-]{8,80}$/i.test(jobId || '')) {
        throw new Error('Invalid egress proxy job registration');
      }
      if (!Array.isArray(allowDomains) || allowDomains.length === 0) {
        throw new Error('Egress proxy registration needs an explicit host allowlist');
      }
      return call('POST', '/jobs', { token, jobId, allowDomains });
    },
    async unregisterJob(token) {
      if (!TOKEN_RE.test(token || '')) throw new Error('Invalid egress proxy job token');
      const body = await call('DELETE', `/jobs/${encodeURIComponent(token)}`);
      return body?.counts ?? {};
    },
    async healthy() {
      try {
        const base = new URL(adminUrl);
        const response = await fetchImpl(new URL('/health', base), {
          signal: AbortSignal.timeout(Math.min(timeoutMs, 2000))
        });
        return response.ok;
      } catch { return false; }
    }
  };
}

const defaultClient = createProxyClient();
export const registerJob = (args) => defaultClient.registerJob(args);
export const unregisterJob = (token) => defaultClient.unregisterJob(token);
export const proxyHealthy = () => defaultClient.healthy();
