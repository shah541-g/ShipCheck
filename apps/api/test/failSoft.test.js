import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFailSoftReportFields, resolveJourneyReportStatus } from '../src/agent/failSoft.js';

test('report fallback fields use a deterministic summary and actionable finding titles', () => {
  const fields = buildFailSoftReportFields({
    host: 'demo.example', pagesAudited: 3, score: 82, grade: 'B',
    counts: { critical: 0, high: 1, medium: 2, low: 0, info: 4 },
    findings: [
      { title: 'Broken Start Free Trial link', page: 'https://demo.example/pricing', counted: true },
      { title: 'Informational note', page: 'https://demo.example/', counted: false }
    ],
    model: 'test-model', aiAvailable: false
  });

  assert.equal(fields.summary, 'ShipCheck audited 3 pages of demo.example and found 3 issues (0 critical, 1 high, 2 medium, 0 low). Score 82 (grade B).');
  assert.deepEqual(fields.topActions, ['Broken Start Free Trial link (https://demo.example/pricing)']);
  assert.deepEqual(fields.ai, { model: 'test-model', visionModel: null, available: false });
  assert.equal('journeysStatus' in fields.ai, false, 'the shared public report shape remains unchanged');
});

test('report fallback survives missing metrics and findings', () => {
  const fields = buildFailSoftReportFields();
  assert.match(fields.summary, /audited 0 pages of the site and found 0 issues/);
  assert.deepEqual(fields.topActions, ['Review the audited pages and rerun the checks after any changes.']);
  assert.equal(fields.ai.available, false);
});

test('journey report status explains unavailable planning or execution without changing Journey.status', () => {
  assert.equal(resolveJourneyReportStatus({ planningAvailable: false }, null), 'not_run');
  assert.equal(resolveJourneyReportStatus({ journeysStatus: 'planned' }, { journeysStatus: 'not_run' }), 'not_run');
  assert.equal(resolveJourneyReportStatus({ journeysStatus: 'planned' }, { journeysStatus: 'partially_run' }), 'partially_run');
  assert.equal(resolveJourneyReportStatus({ journeysStatus: 'planned' }, { journeysStatus: 'run' }), 'run');
  assert.equal(resolveJourneyReportStatus(null, null), 'not_run');
});
