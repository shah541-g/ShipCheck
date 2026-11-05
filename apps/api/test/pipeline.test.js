import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// The store writes job JSON under DATA_DIR, so point it at a throwaway directory
// before config.js is first imported.
process.env.DATA_DIR = path.join(os.tmpdir(), `shipcheck-test-${randomUUID()}`);

const { runJob } = await import('../src/agent/pipeline.js');
const { SandboxError } = await import('../src/sandbox/runSandbox.js');
const { createJob, loadJobs } = await import('../src/jobs/store.js');
await loadJobs();

const target = { url: 'https://demo.example/', host: 'demo.example', domain: 'demo.example' };

const discoverResult = {
  startUrl: 'https://demo.example/',
  candidates: [{ url: 'https://demo.example/' }, { url: 'https://demo.example/pricing' }],
  externalLinks: ['https://x.example/'],
  site: { robotsTxt: true, sitemap: false },
};

// One fake driver per stage, recording what the pipeline asked it to do.
function fakeSandbox({ acts, onAct, runtime = 'runsc' }) {
  let closed = false;
  return {
    ready: async () => {},
    act: async (cmd) => { acts.push(cmd); return onAct ? onAct(cmd) : {}; },
    close: async () => { closed = true; },
    get closed() { return closed; },
    secretsInSandbox: 0,
    runtime,
  };
}

function harness(overrides = {}) {
  const starts = [];
  const acts = [];
  const proxy = { registered: [], unregistered: [] };
  const sandboxes = [];
  const deps = {
    startSandbox: async (args) => {
      starts.push(args);
      const box = fakeSandbox({
        acts,
        onAct: (cmd) => {
          if (cmd.cmd === 'discover') return discoverResult;
          if (cmd.cmd === 'audit') return { url: cmd.url, status: 200, findings: [] };
          return {};
        },
      });
      sandboxes.push(box);
      return box;
    },
    registerJob: async (args) => { proxy.registered.push(args); },
    unregisterJob: async (token) => { proxy.unregistered.push(token); return { 'cdn.tracker.example': 4 }; },
    plan: async () => ({ journeys: [{ id: 'j1', title: 'Start free trial', goal: 'sign up' }], pages: [{ url: 'https://demo.example/' }], ai: { planningAvailable: true, journeysStatus: 'planned' } }),
    explore: async () => ({
      pages: [{ url: 'https://demo.example/', status: 200, findings: [{ checkId: 'seo.og_missing', evidence: {} }] }],
      journeys: [{ title: 'Start free trial', status: 'failed', failedStep: 1, reason: 'dead link', steps: [{ n: 1, toUrl: 'https://demo.example/signup', newErrors: ['http: 404'] }] }],
      actionsUsed: 4,
      ai: { planningAvailable: true, executionAvailable: true, journeysStatus: 'run' },
    }),
    analyze: async () => [],
    report: async (_job, input) => ({ score: 71, grade: 'C', input }),
    ...overrides,
  };
  return { deps, starts, acts, proxy, sandboxes };
}

const stages = (job) => job.events.filter((e) => e.type === 'stage').map((e) => e.data.stage);

test('a job runs the six stages, three containers and one proxy registration', async () => {
  const { deps, starts, acts, proxy, sandboxes } = harness();
  const job = createJob(target);
  await runJob(job, deps);

  assert.equal(job.status, 'done');
  assert.deepEqual(stages(job), ['discovering', 'planning', 'exploring', 'analyzing', 'verifying', 'reporting', 'done']);
  assert.deepEqual(starts.map((s) => s.stage), ['discover', 'explore', 'verify']);
  assert.equal(sandboxes.length, 3);
  assert.ok(sandboxes.every((s) => s.closed), 'every stage container is closed');

  // The proxy token doubles as the sandbox proxy username, which must be 64 hex characters.
  assert.equal(proxy.registered.length, 1);
  assert.match(proxy.registered[0].token, /^[a-f0-9]{64}$/);
  assert.deepEqual(proxy.registered[0].allowDomains, ['demo.example']);
  assert.deepEqual(proxy.unregistered, [proxy.registered[0].token]);

  // Each stage gets the same job token so the proxy counts cover the whole audit.
  for (const s of starts) {
    assert.equal(s.init.proxy.username, proxy.registered[0].token);
    assert.deepEqual(s.init.scope.hosts, ['demo.example', 'www.demo.example']);
    assert.equal(s.init.mode, 'safe');
  }

  // The verify stage re-opens and re-audits the one page with a pending finding.
  assert.deepEqual(acts, [
    { cmd: 'discover', startUrl: 'https://demo.example/' },
    { cmd: 'open', url: 'https://demo.example/' },
    { cmd: 'audit', url: 'https://demo.example/' },
  ]);

  assert.equal(job.report.score, 71);
  assert.equal(job.report.input.containersUsed, 3);
  assert.equal(job.report.input.sandboxRuntime, 'runsc');
  assert.deepEqual(job.report.input.blockCounts, { 'cdn.tracker.example': 4 });
  assert.equal(job.events.at(-1).type, 'done');
});

test('every stage deadline is in the future, including the short discover stage', async () => {
  const { deps, starts } = harness();
  const job = createJob(target);
  const before = Date.now();
  await runJob(job, deps);
  for (const s of starts) {
    assert.ok(s.init.deadline > before, `${s.stage} deadline is not in the future`);
    assert.ok(s.init.deadline <= before + s.stageTimeoutMs, `${s.stage} deadline is past its stage budget`);
  }
});

test('a proxy that will not register stops the job before any container starts', async () => {
  const { deps, starts, proxy } = harness({ registerJob: async () => { throw new Error('down'); } });
  const job = createJob(target);
  await runJob(job, deps);
  assert.equal(job.status, 'failed');
  assert.equal(job.error.code, 'proxy_unavailable');
  assert.equal(starts.length, 0);
  assert.deepEqual(proxy.unregistered, []);
  assert.equal(job.events.at(-1).type, 'error');
});

test('a discover timeout fails the job with the timeout code and still unregisters', async () => {
  const { deps, proxy } = harness({
    startSandbox: async () => ({
      ready: async () => {},
      act: async () => { throw new SandboxError('timeout', 'the discover stage hit its 60 s limit'); },
      close: async () => {},
      secretsInSandbox: 0,
    }),
  });
  const job = createJob(target);
  await runJob(job, deps);
  assert.equal(job.status, 'failed');
  assert.equal(job.error.code, 'timeout');
  assert.equal(proxy.unregistered.length, 1);
  const blocked = job.events.filter((e) => e.type === 'blocked' && e.data.layer === 'resource');
  assert.equal(blocked.length, 1);
  assert.match(blocked[0].message, /BLOCKED \(resource\)/);
});

test('when the verify stage cannot run, the findings are labelled measured once', async () => {
  let call = 0;
  const base = harness();
  const { deps, proxy } = harness({
    startSandbox: async (args) => {
      call += 1;
      if (args.stage === 'verify') throw new SandboxError('docker_unavailable', 'Could not start Docker');
      return base.deps.startSandbox(args);
    },
  });
  const job = createJob(target);
  await runJob(job, deps);
  assert.equal(job.status, 'done');
  assert.ok(call >= 3);
  assert.deepEqual(job.report.input.findings.map((f) => f.verification), ['measured_once', 'measured_once', 'measured_once']);
  assert.ok(job.events.some((e) => e.type === 'warning' && /Verification unavailable/.test(e.message)));
  assert.equal(proxy.unregistered.length, 1);
});

test('a failure inside the explore step is reported as explore_failed', async () => {
  const { deps, proxy } = harness({ explore: async () => { throw new TypeError('boom'); } });
  const job = createJob(target);
  await runJob(job, deps);
  assert.equal(job.status, 'failed');
  assert.equal(job.error.code, 'explore_failed');
  assert.equal(proxy.unregistered.length, 1);
});

test('anything else is internal_error, and the proxy job is still released', async () => {
  const { deps, proxy } = harness({ plan: async () => { throw new TypeError('bad plan'); } });
  const job = createJob(target);
  await runJob(job, deps);
  assert.equal(job.status, 'failed');
  assert.equal(job.error.code, 'internal_error');
  assert.match(job.error.message, /Unexpected error: bad plan/);
  assert.equal(proxy.unregistered.length, 1);
});

test('the findings built from the rules reach the report, journey failure included', async () => {
  const { deps } = harness();
  const job = createJob(target);
  await runJob(job, deps);
  const checkIds = job.report.input.findings.map((f) => f.checkId);
  assert.deepEqual(checkIds, ['seo.og_missing', 'site.sitemap_missing', 'journey.failed']);
  assert.ok(job.events.some((e) => e.type === 'finding' && e.data.checkId === 'journey.failed'));
});
