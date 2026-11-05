import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../src/agent/report.js';
import { addFinding } from '../src/agent/findings.js';

const B64 = Buffer.from('shot').toString('base64');

const makeJob = () => ({
  id: '11112222-3333-4444-5555-666677778888',
  createdAt: '2026-11-05T10:00:00.000Z',
  mode: 'safe',
  target: { url: 'https://demo.example/', host: 'demo.example', domain: 'demo.example' },
  events: [
    { type: 'blocked', data: { layer: 'browser', reason: 'Write request blocked in safe mode (POST)' } },
    { type: 'blocked', data: { layer: 'ai', reason: 'Dangerous action blocked: "Delete account"' } },
    { type: 'progress', message: 'ignored' },
  ],
});

const makeInput = () => {
  const findings = [];
  addFinding(findings, 'seo.og_missing', 'https://demo.example/', {});
  addFinding(findings, 'http.error_status', 'https://demo.example/gone', { status: 404 });
  addFinding(findings, 'journey.failed', 'https://demo.example/signup', { journey: 'Start free trial', screenshotB64: B64 });
  for (const f of findings) if (f.verification === 'pending') f.verification = 'verified';
  return {
    discover: { startUrl: 'https://demo.example/', externalLinks: ['https://x.example/', 'https://y.example/'], site: { robotsTxt: true, sitemap: true } },
    pages: [{ url: 'https://demo.example/', finalUrl: 'https://demo.example/', status: 200, timing: { ttfb: 80, lcp: 900 }, screenshot: B64 }],
    journeys: [{ title: 'Start free trial', status: 'failed', steps: [{ n: 1, screenshotB64: B64 }, { n: 2, screenshotB64: null }] }],
    findings,
    observations: [{ page: 'https://demo.example/', title: 'The pricing page buries the price', detail: 'It is below three screens of text.' }],
    blockCounts: { 'cdn.tracker.example': 7, 'fonts.other.example': 2 },
    secretsInSandbox: 0,
    containersUsed: 3,
    writeRequestsBlocked: 1,
    sandboxRuntime: 'runsc',
  };
};

const summarize = async () => ({ summary: 'Two serious problems stop new visitors from signing up.', topActions: ['Fix the 404', 'Add og tags', 'Re-test the trial journey', 'Ignored fourth'] });

test('the report scores, sorts, uploads and keeps no base64 behind', async () => {
  const job = makeJob();
  const input = makeInput();
  const uploaded = [];
  const upload = async (jobId, n, buffer) => { uploaded.push({ jobId, n, size: buffer.length }); return `/api/files/${jobId}/${n}.jpg`; };

  const report = await buildReport(job, input, { upload, summarize });

  assert.equal(report.target, 'https://demo.example/');
  assert.equal(report.mode, 'safe');
  assert.equal(report.startedAt, job.createdAt);
  assert.ok(report.finishedAt);

  // critical 15 + low 1; the journey.failed high 8; info costs nothing
  assert.equal(report.score, 76);
  assert.equal(report.grade, 'B');
  assert.deepEqual(report.findings.map((f) => f.severity), ['critical', 'high', 'low', 'info', 'info']);

  // the third-party hosts and the AI observation become findings
  assert.deepEqual(report.thirdPartyHosts, [{ host: 'cdn.tracker.example', count: 7 }, { host: 'fonts.other.example', count: 2 }]);
  const privacy = report.findings.find((f) => f.checkId === 'privacy.third_party_hosts');
  assert.equal(privacy.severity, 'info');
  const observation = report.findings.find((f) => f.checkId === 'ai.observation');
  assert.equal(observation.aiWritten, true);
  assert.match(observation.title, /^AI observation: /);

  // every screenshot is uploaded once and the base64 is gone from the job
  assert.equal(uploaded.length, 3);
  assert.equal(report.pages[0].screenshotUrl, `/api/files/${job.id}/1.jpg`);
  assert.equal('screenshot' in input.pages[0], false);
  assert.equal(input.journeys[0].steps[0].screenshotB64, undefined);
  assert.ok(input.journeys[0].steps[0].screenshotUrl.startsWith('/api/files/'));
  assert.equal(input.journeys[0].steps[1].screenshotUrl, undefined);
  const journeyFinding = report.findings.find((f) => f.checkId === 'journey.failed');
  assert.equal(journeyFinding.evidence.screenshotB64, undefined);
  assert.ok(journeyFinding.evidence.screenshotUrl.startsWith('/api/files/'));
  assert.equal(JSON.stringify(report).includes(B64), false);

  // containment is reported from what actually happened, not from the config
  assert.equal(report.containment.sandboxRuntime, 'runsc');
  assert.equal(report.containment.containersUsed, 3);
  assert.equal(report.containment.secretsInSandbox, 0);
  assert.equal(report.containment.writeRequestsBlocked, 1);
  assert.equal(report.containment.externalLinksNotFollowed, 2);
  assert.equal(report.containment.blocksByLayer.browser, 1);
  assert.equal(report.containment.blocksByLayer.ai, 1);
  assert.equal(report.containment.blocksByLayer.network, 9);   // 7 + 2 from the proxy counts

  assert.equal(report.summary, 'Two serious problems stop new visitors from signing up.');
  assert.equal(report.topActions.length, 3);
  assert.equal(report.ai.available, true);
});

test('a screenshot that cannot be stored leaves a warning and a null URL', async () => {
  const job = makeJob();
  const warnings = [];
  const report = await buildReport(job, makeInput(), {
    upload: async () => { throw new Error('bucket unreachable'); },
    summarize,
    emit: (type, data) => { if (type === 'warning') warnings.push(data.message); },
  });
  assert.equal(report.pages[0].screenshotUrl, null);
  assert.ok(warnings.some((w) => /Could not store a screenshot/.test(w)));
});

test('without AI the report still has a summary and says so', async () => {
  const job = makeJob();
  const input = makeInput();
  const warnings = [];
  const report = await buildReport(job, input, {
    upload: async (jobId, n) => `/api/files/${jobId}/${n}.jpg`,
    summarize: async () => { throw new Error('AI request failed'); },
    emit: (type, data) => { if (type === 'warning') warnings.push(data.message); },
  });
  assert.match(report.summary, /^ShipCheck audited 1 pages of demo\.example and found 3 issues/);
  assert.match(report.summary, /Score 76 \(grade B\)/);
  assert.ok(report.topActions.length >= 1 && report.topActions.length <= 3);
  assert.ok(warnings.some((w) => /AI summary unavailable/.test(w)));
  // The one observation was written by the AI pass, so the report may still say AI ran.
  assert.equal(report.ai.available, true);
});

test('a reply that parses but says nothing falls back as well', async () => {
  const report = await buildReport(makeJob(), { ...makeInput(), observations: [] }, {
    upload: async (jobId, n) => `/api/files/${jobId}/${n}.jpg`,
    summarize: async () => ({ summary: '   ', topActions: ['  '] }),
  });
  assert.match(report.summary, /^ShipCheck audited/);
  assert.equal(report.ai.available, false);
});
