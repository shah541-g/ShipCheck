import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyVerification, markAllMeasuredOnce, pagesToVerify } from '../src/agent/verify.js';

test('labels findings from the verify run', () => {
  const findings = [
    { checkId: 'links.broken', page: 'https://a.com/', evidence: { link: 'https://a.com/x' }, verification: 'pending' },
    { checkId: 'console.error', page: 'https://a.com/', evidence: { text: 'boom' }, verification: 'pending' },
    { checkId: 'seo.h1_missing', page: 'https://a.com/b', evidence: {}, verification: 'pending' },
    { checkId: 'perf.slow_lcp', page: 'https://a.com/', evidence: {}, verification: 'measured_once' },
  ];
  applyVerification(findings, [{ url: 'https://a.com/', findings: [{ checkId: 'links.broken', evidence: { link: 'https://a.com/x' } }] }]);
  assert.deepEqual(findings.map((f) => f.verification), ['verified', 'not_reproduced', 'measured_once', 'measured_once']);
});

test('only pages with a pending finding are worth a second visit, and each one once', () => {
  const findings = [
    { checkId: 'links.broken', page: 'https://a.com/', verification: 'pending' },
    { checkId: 'seo.h1_missing', page: 'https://a.com/', verification: 'pending' },
    { checkId: 'perf.slow_lcp', page: 'https://a.com/slow', verification: 'measured_once' },
  ];
  assert.deepEqual(pagesToVerify(findings), ['https://a.com/']);
});

test('when the verify stage cannot run, nothing is left pending', () => {
  const findings = [
    { checkId: 'links.broken', verification: 'pending' },
    { checkId: 'seo.og_missing', verification: 'verified' },
  ];
  markAllMeasuredOnce(findings);
  assert.deepEqual(findings.map((f) => f.verification), ['measured_once', 'verified']);
});

test('two findings of the same check on one page are matched by their evidence', () => {
  const findings = [
    { checkId: 'links.broken', page: 'https://a.com/', evidence: { link: 'https://a.com/gone' }, verification: 'pending' },
    { checkId: 'links.broken', page: 'https://a.com/', evidence: { link: 'https://a.com/fixed' }, verification: 'pending' },
  ];
  applyVerification(findings, [{ url: 'https://a.com/', findings: [{ checkId: 'links.broken', evidence: { link: 'https://a.com/gone' } }] }]);
  assert.deepEqual(findings.map((f) => f.verification), ['verified', 'not_reproduced']);
});
