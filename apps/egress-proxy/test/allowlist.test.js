import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowed } from '../src/allowlist.js';

const job = { allowDomains: new Set(['example.com']) };

test('allows the target domain and its subdomains', () => {
  assert.ok(isAllowed(job, 'example.com'));
  assert.ok(isAllowed(job, 'cdn.example.com'));
});

test('allows listed CDNs but not trackers', () => {
  assert.ok(isAllowed(job, 'fonts.gstatic.com'));
  assert.ok(!isAllowed(job, 'www.googletagmanager.com'));
});

test('blocks other hosts, look-alikes and IPs', () => {
  assert.ok(!isAllowed(job, 'attacker.example'));
  assert.ok(!isAllowed(job, 'example.com.attacker.example'));
  assert.ok(!isAllowed(job, '169.254.169.254'));
});

test('shared platforms are allowed per customer, not as a whole', () => {
  const vercelJob = { allowDomains: new Set(['my-shop.vercel.app']) };
  assert.ok(isAllowed(vercelJob, 'my-shop.vercel.app'));
  assert.ok(!isAllowed(vercelJob, 'attacker.vercel.app'));
});

test('an exact host entry allows only that host', () => {
  const demoJob = { allowDomains: new Set(['demo.203.0.113.10.sslip.io']) };
  assert.ok(isAllowed(demoJob, 'demo.203.0.113.10.sslip.io'));
  assert.ok(!isAllowed(demoJob, 'app.203.0.113.10.sslip.io'));
  assert.ok(!isAllowed(demoJob, '198.51.100.7.sslip.io'));
});
