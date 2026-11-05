import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { addEvent, setStage, saveJob, clearSecret } from '../jobs/store.js';
import { startSandbox, SandboxError } from '../sandbox/runSandbox.js';
import { registerJob, unregisterJob } from '../sandbox/proxyClient.js';
import { scopeHosts } from '../security/policy.js';
import { createAgentEventAdapter } from './eventAdapter.js';
import { planJourneysAndPages } from './plan.js';
import { explore } from './explorer.js';
import { buildFindings } from './findings.js';
import { analyzePages } from './analyze.js';
import { pagesToVerify, applyVerification, markAllMeasuredOnce } from './verify.js';
import { buildReport } from './report.js';

class JobError extends Error { constructor(code, message) { super(message); this.code = code; } }

// The sandbox driver, the planner, the explorer and the analyzer all report through
// emit(type, data, message); the adapter turns that into one canonical store event and
// redacts the AI key, the internal token and any test login on the way.
export async function runJob(job, deps = {}) {
  const {
    startSandbox: start = startSandbox,
    registerJob: register = registerJob,
    unregisterJob: unregister = unregisterJob,
    plan: planStep = planJourneysAndPages,
    explore: exploreStep = explore,
    analyze: analyzeStep = analyzePages,
    report: reportStep = buildReport,
  } = deps;

  const emit = createAgentEventAdapter({ job, addEvent });
  // 64 hex characters: the proxy client and the sandbox driver both require that shape,
  // because the token doubles as the proxy username for this job.
  const token = randomBytes(32).toString('hex');
  const scope = { hosts: scopeHosts(job.target.host) };
  const proxy = { server: config.sandbox.proxyUrl, username: token, password: 'x' };
  const baseLimits = { pageTimeoutMs: config.limits.pageTimeoutMs, actionTimeoutMs: config.limits.actionTimeoutMs,
    maxLinksPerPage: config.limits.maxLinksPerPage, maxCandidates: config.limits.maxCandidates };
  const aiStatus = {};
  let containersUsed = 0;
  let secretsInSandbox = 0;
  let sandboxRuntime = config.sandbox.runtime;
  let registered = false;

  // Start one locked container for a stage, run fn(driver), always close it.
  const withSandbox = async (stage, stageTimeoutMs, fn) => {
    containersUsed += 1;
    // The runner stops its own long work at this deadline, so it must leave the driver
    // room to answer. Reserve time for the last page, but never more than a quarter of
    // the stage: the discover stage's whole budget is smaller than a flat reserve, and a
    // deadline in the past makes the runner skip link checks silently.
    const reserve = Math.min(2 * config.limits.pageTimeoutMs + 25000, Math.floor(stageTimeoutMs / 4));
    const init = { init: true, kind: stage, jobId: job.id, mode: job.mode, proxy, scope,
      limits: baseLimits, deadline: Date.now() + stageTimeoutMs - reserve };
    let sandbox;
    try {
      sandbox = await start({ jobId: job.id, stage, init, onEvent: emit, stageTimeoutMs });
      return await fn(sandbox);
    } catch (err) {
      if (err instanceof SandboxError && (err.code === 'timeout' || err.code === 'resource_limit')) {
        emit('blocked', { layer: 'resource', target: stage, reason: err.message });
      }
      throw err;
    } finally {
      if (sandbox) {
        secretsInSandbox = Math.max(secretsInSandbox, sandbox.secretsInSandbox ?? 0);
        sandboxRuntime = sandbox.runtime ?? sandboxRuntime;
        await sandbox.close().catch(() => {});
      }
    }
  };

  try {
    // 1. Register the job with the proxy. Fail closed.
    setStage(job, 'discovering', 'Opening the site in a fresh sandbox');
    try { await register({ token, jobId: job.id, allowDomains: [job.target.domain] }); registered = true; }
    catch { throw new JobError('proxy_unavailable', 'Sandbox network unavailable, please try again'); }

    // 2. Discover.
    let discover;
    try {
      discover = await withSandbox('discover', config.limits.discoverTimeoutMs,
        (s) => s.act({ cmd: 'discover', startUrl: job.target.url }));
    } catch (err) {
      throw new JobError(err.code === 'timeout' ? 'timeout' : 'discover_failed', `Could not open the site: ${err.message}`);
    }
    emit('progress', { message: `Found ${discover.candidates.length} pages and ${discover.externalLinks.length} external links (external links are never followed)` });

    // 3. Plan (journeys + pages, AI + L2 guard).
    setStage(job, 'planning', 'The AI is planning journeys and pages');
    const plan = await planStep(job, discover, { emit });
    job.pages = plan.pages;
    job.journeys = plan.journeys.map((j) => ({ ...j, status: 'pending', steps: [] }));

    // 4. Explore (the AI drives the browser).
    setStage(job, 'exploring', `Exploring ${plan.journeys.length} journeys and up to ${plan.pages.length} pages`);
    let explored;
    try {
      explored = await withSandbox('explore', config.limits.exploreTimeoutMs,
        (s) => exploreStep(job, s, { plan, scope, mode: job.mode, emit }));
    } catch (err) {
      throw new JobError('explore_failed', `The explore step failed: ${err.message}`);
    }
    job.journeys = explored.journeys;
    saveJob(job);

    // 5-6. Findings from the rules, then the AI explanation pass.
    setStage(job, 'analyzing', 'Turning measurements into findings');
    const findings = buildFindings(discover, explored.pages, explored.journeys, job.target.url);
    for (const f of findings) emit('finding', { severity: f.severity, checkId: f.checkId }, `${f.severity.toUpperCase()}: ${f.title} (${f.page})`);
    const observations = await analyzeStep(job, explored.pages, findings, { emit, aiStatus });

    // 7. Prove-It: re-audit the verifiable page findings in a NEW container.
    // Core has no journey replay, so a failed journey stays "measured once".
    setStage(job, 'verifying', 'Prove-It: re-checking findings in a new, clean sandbox');
    const verifyUrls = pagesToVerify(findings);
    if (verifyUrls.length) {
      try {
        const verifyPages = await withSandbox('verify', config.limits.verifyTimeoutMs, async (s) => {
          const out = [];
          // No time check here: the stage timer in startSandbox kills the container, which
          // rejects the in-flight act() and ends this loop.
          for (const url of verifyUrls) {
            try { await s.act({ cmd: 'open', url }); out.push(await s.act({ cmd: 'audit', url })); } catch { /* skip this page */ }
          }
          return out;
        });
        applyVerification(findings, verifyPages);
      } catch (err) {
        markAllMeasuredOnce(findings);
        emit('warning', { message: `Verification unavailable (${err.message}); findings marked "measured once"` });
      }
    } else {
      markAllMeasuredOnce(findings);
    }

    // 8. Unregister first (that is what returns the block counts), then build the report.
    setStage(job, 'reporting', 'Building the report');
    let blockCounts = {};
    try { blockCounts = await unregister(token); registered = false; }
    catch { emit('warning', { message: 'Could not read the network block counts' }); }

    const writeRequestsBlocked = job.events.filter((e) => e.type === 'blocked' && e.data?.layer === 'browser' && /write request/i.test(e.data?.reason ?? '')).length;
    job.report = await reportStep(job, {
      discover, pages: explored.pages, journeys: explored.journeys, findings, observations,
      blockCounts, secretsInSandbox, containersUsed, writeRequestsBlocked, sandboxRuntime,
    }, { emit });
    setStage(job, 'done', `Done: score ${job.report.score} (grade ${job.report.grade})`);
    emit('done', { score: job.report.score, grade: job.report.grade }, 'The report is ready');
  } catch (err) {
    const known = err instanceof JobError;
    job.status = 'failed';
    job.error = { code: known ? err.code : 'internal_error', message: known ? err.message : `Unexpected error: ${err.message}` };
    emit('error', { code: job.error.code }, job.error.message);
    if (!known) console.error(`Job ${job.id} failed:`, err);
  } finally {
    if (registered) await unregister(token).catch(() => {});
    clearSecret(job.id);
    job._login = null;
    await saveJob(job, { now: true });
  }
}
