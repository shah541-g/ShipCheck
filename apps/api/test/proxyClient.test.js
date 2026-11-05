import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProxyClient } from '../src/sandbox/proxyClient.js';

const token = 'a'.repeat(64);

test('registers an explicit per-job allowlist using the host-only internal token', async () => {
  const requests = [];
  const client = createProxyClient({
    adminUrl: 'http://egress-proxy:8080',
    internalToken: 'host-internal-secret',
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  });
  await client.registerJob({ token, jobId: '12345678-abcd', allowDomains: ['demo.example'] });
  assert.equal(requests[0].url, 'http://egress-proxy:8080/jobs');
  assert.equal(requests[0].options.headers['x-internal-token'], 'host-internal-secret');
  assert.deepEqual(JSON.parse(requests[0].options.body), { token, jobId: '12345678-abcd', allowDomains: ['demo.example'] });
});

test('unregisters proxy tokens without placing them in error messages', async () => {
  const requests = [];
  const client = createProxyClient({
    adminUrl: 'http://egress-proxy:8080',
    internalToken: 'host-internal-secret',
    fetchImpl: async (url) => {
      requests.push(String(url));
      return { ok: true, status: 200, json: async () => ({ counts: { blocked: 2 } }) };
    }
  });
  assert.deepEqual(await client.unregisterJob(token), { blocked: 2 });
  assert.equal(requests[0], `http://egress-proxy:8080/jobs/${token}`);
});

test('rejects malformed job registration and does not print internal credentials on failure', async () => {
  let calls = 0;
  const client = createProxyClient({
    adminUrl: 'http://egress-proxy:8080',
    internalToken: 'host-internal-secret',
    fetchImpl: async () => { calls += 1; return { ok: false, status: 503 }; }
  });
  await assert.rejects(client.registerJob({ token: 'bad', jobId: 'bad', allowDomains: [] }), /Invalid egress proxy job registration/);
  await assert.rejects(client.registerJob({ token, jobId: '12345678-abcd', allowDomains: ['demo.example'] }), (error) => {
    assert.match(error.message, /HTTP 503/);
    assert.equal(error.message.includes('host-internal-secret'), false);
    return true;
  });
  assert.equal(calls, 1);
});
