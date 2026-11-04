import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress } from '../src/ipguard.js';

test('private and special addresses are not public', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test('public addresses are public', () => {
  for (const ip of ['1.1.1.1', '8.8.8.8', '93.184.215.14']) assert.equal(isPublicAddress(ip), true, ip);
});
