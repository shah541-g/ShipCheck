import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAction } from '../src/security/actionGuard.js';

const snapshot = { url: 'https://example.com/', elements: [
  { n: 1, tag: 'a', name: 'Pricing', typeable: false, secret: false },
  { n: 2, tag: 'input', name: 'Email', typeable: true, secret: false },
  { n: 3, tag: 'input', name: 'Password', typeable: false, secret: true },
  { n: 4, tag: 'button', name: 'Delete account', typeable: false, secret: false },
] };
const ctx = { scopeHosts: ['example.com', 'www.example.com'], mode: 'safe', hasLogin: false, loginUsed: false };

test('allows a normal click and a type into a text field', () => {
  assert.ok(checkAction({ action: 'click', n: 1, reason: 'x' }, snapshot, ctx).ok);
  assert.ok(checkAction({ action: 'type', n: 2, text: 'test@example.com', reason: 'x' }, snapshot, ctx).ok);
});

test('blocks a danger-word click in every mode', () => {
  assert.ok(!checkAction({ action: 'click', n: 4, reason: 'x' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'click', n: 4, reason: 'x' }, snapshot, { ...ctx, mode: 'staging' }).ok);
});

test('blocks typing into a password/secret field and overly long text', () => {
  assert.ok(!checkAction({ action: 'type', n: 3, text: 'hunter2', reason: 'x' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'type', n: 2, text: 'a'.repeat(201), reason: 'x' }, snapshot, ctx).ok);
});

test('blocks a missing element, an off-site goto, an odd port and an unknown shape', () => {
  assert.ok(!checkAction({ action: 'click', n: 99, reason: 'x' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'goto', url: 'https://attacker.example/', reason: 'x' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'goto', url: 'https://example.com:8443/', reason: 'x' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'run', code: 'x' }, snapshot, ctx).ok);
});

test('rejects extra keys on an otherwise valid action', () => {
  assert.ok(!checkAction({ action: 'click', n: 1, reason: 'x', script: 'alert(1)' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'done', status: 'passed', reason: 'x', selector: '#pay' }, snapshot, ctx).ok);
});

test('targets are read from the current snapshot only', () => {
  assert.ok(!checkAction({ action: 'type', n: 2, text: 'x', reason: 'x' }, { elements: [] }, ctx).ok);
  assert.ok(!checkAction({ action: 'click', n: 1, reason: 'x' }, undefined, ctx).ok);
});

test('login is blocked without a test login', () => {
  assert.ok(!checkAction({ action: 'login', reason: 'x' }, snapshot, ctx).ok);
  assert.ok(checkAction({ action: 'login', reason: 'x' }, snapshot, { ...ctx, hasLogin: true }).ok);
  assert.ok(!checkAction({ action: 'login', reason: 'x' }, snapshot, { ...ctx, hasLogin: true, loginUsed: true }).ok);
});

test('select follows the same element rules as type', () => {
  assert.ok(checkAction({ action: 'select', n: 2, value: 'uk', reason: 'x' }, snapshot, ctx).ok);
  assert.ok(!checkAction({ action: 'select', n: 3, value: 'uk', reason: 'x' }, snapshot, ctx).ok);
});

test('done is always allowed', () => {
  assert.ok(checkAction({ action: 'done', status: 'passed', reason: 'ok' }, snapshot, ctx).ok);
});
