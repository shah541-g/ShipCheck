import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFindings, countBySeverity } from '../src/agent/scoring.js';

test('caps each check at 3 and ignores not_reproduced and info', () => {
  const f = (checkId, severity, verification = 'verified') => ({ checkId, severity, verification });
  const findings = [
    f('links.broken', 'high'), f('links.broken', 'high'), f('links.broken', 'high'), f('links.broken', 'high'),
    f('seo.og_missing', 'low', 'not_reproduced'),
    f('ai.observation', 'info', 'measured_once'),
  ];
  const { score, grade } = scoreFindings(findings);
  assert.equal(score, 76);
  assert.equal(grade, 'B');
  assert.deepEqual(findings.map((x) => x.counted), [true, true, true, false, false, false]);
});

test('a measured-once journey.failed still counts', () => {
  const { score } = scoreFindings([{ checkId: 'journey.failed', severity: 'high', verification: 'measured_once' }]);
  assert.equal(score, 92);
});

test('the score never falls below zero and an unknown severity costs nothing', () => {
  const critical = Array.from({ length: 9 }, (_, i) => ({ checkId: `c${i}`, severity: 'critical', verification: 'verified' }));
  const { score, grade } = scoreFindings(critical);
  assert.equal(score, 0);
  assert.equal(grade, 'F');
  assert.equal(scoreFindings([{ checkId: 'x', severity: 'spicy', verification: 'verified' }]).score, 100);
});

test('every grade boundary lands on the documented letter', () => {
  const at = (deduction) => scoreFindings(
    Array.from({ length: deduction }, (_, i) => ({ checkId: `c${i}`, severity: 'low', verification: 'verified' })),
  ).grade;
  assert.equal(at(10), 'A');   // 90
  assert.equal(at(11), 'B');   // 89
  assert.equal(at(25), 'B');   // 75
  assert.equal(at(26), 'C');   // 74
  assert.equal(at(40), 'C');   // 60
  assert.equal(at(41), 'D');   // 59
  assert.equal(at(60), 'D');   // 40
  assert.equal(at(61), 'F');   // 39
});

test('the severity counts shown on the report drop only not_reproduced', () => {
  const counts = countBySeverity([
    { severity: 'critical', verification: 'verified' },
    { severity: 'high', verification: 'measured_once' },
    { severity: 'high', verification: 'not_reproduced' },
    { severity: 'info', verification: 'measured_once' },
  ]);
  assert.deepEqual(counts, { critical: 1, high: 1, medium: 0, low: 0, info: 1 });
});
