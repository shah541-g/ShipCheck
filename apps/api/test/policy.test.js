import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTarget, isInScope, scopeHosts, PolicyError } from '../src/security/policy.js';

test('normalizes public URLs and removes fragments', () => {
  assert.deepEqual(normalizeTarget('https://Example.com/path#top'), { url: 'https://example.com/path', host: 'example.com', domain: 'example.com' });
});

for (const bad of ['http://localhost', 'http://127.0.0.1', 'http://169.254.169.254/latest', 'http://[::1]/', 'ftp://example.com', 'https://user:pw@example.com', 'https://example.com:8443', 'http://example.com:443', 'https://example.com:80', 'not a url', 'http://printer.local', 'http://intranet']) {
  test(`rejects unsafe target ${bad}`, () => assert.throws(() => normalizeTarget(bad), PolicyError));
}

test('keeps shared-platform and wildcard-DNS host scope narrow', () => {
  assert.equal(normalizeTarget('https://my-shop.vercel.app/').domain, 'my-shop.vercel.app');
  assert.equal(normalizeTarget('https://demo.203.0.113.10.sslip.io/').domain, 'demo.203.0.113.10.sslip.io');
  assert.equal(normalizeTarget('https://www.example.co.uk/').domain, 'example.co.uk');
});

test('scope allows target and www only, on default ports', () => {
  const hosts = scopeHosts('www.example.com');
  assert.ok(isInScope('https://example.com/a', hosts));
  assert.ok(isInScope('http://www.example.com/b', hosts));
  assert.ok(!isInScope('https://attacker.example/', hosts));
  assert.ok(!isInScope('https://example.com:8443/', hosts));
  assert.ok(!isInScope('mailto:hi@example.com', hosts));
});
