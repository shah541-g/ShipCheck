import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown } from '../src/agent/markdown.js';

const job = {
  target: { host: 'demo.example' },
  report: {
    target: 'https://demo.example/', mode: 'safe', finishedAt: '2026-11-05T11:30:00.000Z',
    score: 62, grade: 'C', summary: 'Two problems block signups.', topActions: ['Fix the 404', 'Add og tags'],
    pages: [{ url: 'https://demo.example/' }, { url: 'https://demo.example/pricing' }],
    journeys: [{ title: 'Start free trial', status: 'failed', reason: 'The signup page is missing' },
      { title: 'Contact form', status: 'passed', reason: '' }],
    findings: [
      { severity: 'critical', verification: 'verified', title: 'Page returns an error status', page: 'https://demo.example/gone', evidence: { status: 404 }, why: 'Visitors see an error.', fix: 'Restore the page.' },
      { severity: 'high', verification: 'measured_once', title: 'User journey could not be completed', page: 'https://demo.example/signup', evidence: { journey: 'Start free trial' }, why: 'Signups are lost.', fix: 'Fix the dead link.' },
      { severity: 'low', verification: 'not_reproduced', title: 'Missing social sharing tags', page: 'https://demo.example/', evidence: {}, why: 'Shares look bare.', fix: 'Add og:title.' },
    ],
    containment: {
      mode: 'safe', writeRequestsBlocked: 1, blocksByLayer: { input: 0, ai: 1, browser: 2, network: 9, resource: 0 },
      externalLinksNotFollowed: 2, secretsInSandbox: 0, sandboxRuntime: 'runsc', containersUsed: 3,
    },
  },
};

test('the Markdown export carries the header, summary, journeys, findings and containment', () => {
  const md = toMarkdown(job);
  assert.match(md, /^# ShipCheck report: demo\.example/);
  assert.match(md, /- Score: \*\*62\/100\*\* \(grade \*\*C\*\*\)/);
  assert.match(md, /- Pages audited: 2/);
  assert.match(md, /## Summary\n\nTwo problems block signups\./);
  assert.match(md, /1\. Fix the 404\n2\. Add og tags/);
  assert.match(md, /- \*\*Start free trial\*\* — failed: The signup page is missing/);
  assert.match(md, /- \*\*Contact form\*\* — passed$/m);
  assert.match(md, /### Critical \(1\)/);
  assert.match(md, /### High \(1\)/);
  assert.match(md, /### Low \(1\)/);
  assert.doesNotMatch(md, /### Medium/);
  assert.match(md, /- \*\*User journey could not be completed\*\* \(measured once\)/);
  assert.match(md, /- Blocks by layer: input 0, ai 1, browser 2, network 9, resource 0/);
  assert.match(md, /- Sandbox runtime: runsc/);
  assert.match(md, /- Fresh containers used: 3/);
});

test('a backtick in the evidence cannot break out of the evidence code span', () => {
  const md = toMarkdown({
    ...job,
    report: { ...job.report, findings: [{ severity: 'medium', verification: 'verified', title: 'Error in the browser console',
      page: 'https://demo.example/', evidence: { text: 'Uncaught `x` ``` # heading' }, why: 'w', fix: 'f' }] },
  });
  const line = md.split('\n').find((l) => l.includes('Evidence:'));
  assert.equal(line.startsWith('  - Evidence: `'), true);
  assert.equal(line.endsWith('`'), true);
  assert.equal(line.slice(16, -1).includes('`'), false);
});

test('a report with no journeys leaves the journeys section out', () => {
  const md = toMarkdown({ ...job, report: { ...job.report, journeys: [] } });
  assert.doesNotMatch(md, /## User journeys/);
  assert.match(md, /## Findings/);
});
