import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTarget, isInScope, scopeHosts } from '../src/security/policy.js';

test('accepts and normalizes a public URL', () => {
  const t = normalizeTarget('https://Example.com/path#top');
  assert.equal(t.host, 'example.com');
  assert.equal(t.domain, 'example.com');
  assert.equal(t.url, 'https://example.com/path');
});

for (const bad of ['http://localhost', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'http://[::1]/', 'ftp://example.com',
  'https://user:pw@example.com', 'https://example.com:8443', 'not a url', 'http://printer.local', 'http://intranet']) {
  test(`rejects ${bad}`, () => assert.throws(() => normalizeTarget(bad)));
}

test('shared platforms and wildcard DNS get a narrow allowlist domain', () => {
  assert.equal(normalizeTarget('https://my-shop.vercel.app/').domain, 'my-shop.vercel.app');
  assert.equal(normalizeTarget('https://demo.203.0.113.10.sslip.io/').domain, 'demo.203.0.113.10.sslip.io');
  assert.equal(normalizeTarget('https://www.example.co.uk/').domain, 'example.co.uk');
});

test('scope covers the bare and www host only', () => {
  const hosts = scopeHosts('www.example.com');
  assert.ok(isInScope('https://example.com/a', hosts));
  assert.ok(isInScope('https://www.example.com/b', hosts));
  assert.ok(!isInScope('https://attacker.example/', hosts));
  assert.ok(!isInScope('mailto:hi@example.com', hosts));
});
