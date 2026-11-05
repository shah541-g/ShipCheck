import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAction } from '../src/security/actionGuard.js';

const snapshot = { url: 'https://example.com/', elements: [
  { n: 1, tag: 'a', name: 'Pricing', typeable: false, secret: false },
  { n: 2, tag: 'input', name: 'Email', typeable: true, secret: false },
  { n: 3, tag: 'input', name: 'Password', typeable: false, secret: true },
  { n: 4, tag: 'button', name: 'Delete account', typeable: false, secret: false }
] };
const ctx = { scopeHosts: ['example.com', 'www.example.com'], mode: 'safe' };

test('allows a normal click and a type into a text field', () => {
  assert.ok(checkAction({ action: 'click', n: 1, reason: 'Open pricing' }, snapshot, ctx).ok);
  assert.ok(checkAction({ action: 'type', n: 2, text: 'test@example.com', reason: 'Try form' }, snapshot, ctx).ok);
});

test('blocks dangerous actions in every mode', () => {
  assert.ok(!checkAction({ action: 'click', n: 4, reason: 'test' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'click', n: 4, reason: 'test' }, snapshot, { ...ctx, mode: 'staging' }).ok);
  assert.ok(!checkAction({ action: 'click', n: 4, reason: 'test' }, snapshot, { ...ctx, mode: 'safe' }).ok);
});

test('blocks secret fields, overlong text, and unknown elements', () => {
  assert.ok(!checkAction({ action: 'type', n: 3, text: 'test value', reason: 'test' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'type', n: 2, text: 'a'.repeat(201), reason: 'test' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'click', n: 99, reason: 'test' }, snapshot, ctx).ok);
});

test('blocks off-site, odd-port, unknown, and non-Core action shapes', () => {
  assert.ok(!checkAction({ action: 'goto', url: 'https://attacker.example/', reason: 'test' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'goto', url: 'https://example.com:8443/', reason: 'test' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'run', code: 'x' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'select', n: 2, value: 'x', reason: 'test' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'click', n: 1, reason: 'test', script: 'alert(1)' }, snapshot, ctx).ok);
});

test('done is allowed, and targets are checked against current snapshot only', () => {
  assert.ok(checkAction({ action: 'done', status: 'passed', reason: 'Goal achieved' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'type', n: 2, text: 'x', reason: 'test' }, { elements: [] }, ctx).ok);
});
