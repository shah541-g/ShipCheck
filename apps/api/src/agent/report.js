import { z } from 'zod';
import { config } from '../config.js';
import { llmJson } from '../llm/json.js';
import { SUMMARY_SYSTEM } from '../llm/prompts.js';
import { scopeHosts } from '../security/policy.js';
import { putScreenshot } from '../storage/index.js';
import { addFinding } from './findings.js';
import { buildFailSoftReportFields } from './failSoft.js';
import { scoreFindings, countBySeverity } from './scoring.js';

const SummarySchema = z.object({ summary: z.string().min(1), topActions: z.array(z.string()).min(1) });
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

const hostOf = (value) => { try { return new URL(String(value)).hostname.toLowerCase(); } catch { return null; } };

// Which outside services the site tried to contact, and how often. Two layers see this and
// they see different attempts: the browser write-guard (L3) aborts an off-site request
// before it reaches the network, so the egress proxy (L4) only counts what got that far.
// Reading the proxy alone reported no third parties at all for a normal site. The larger of
// the two counts per host is used, so the number is never overstated.
function thirdPartiesContacted(job, blockCounts) {
  const own = new Set(scopeHosts(job.target.host));
  const fromProxy = new Map(Object.entries(blockCounts ?? {}).map(([host, count]) => [String(host).toLowerCase(), count]));
  const fromBrowser = new Map();
  for (const ev of job.events) {
    if (ev.type !== 'blocked') continue;
    if (ev.data?.layer !== 'browser' && ev.data?.layer !== 'network') continue;
    const host = hostOf(ev.data.target);
    if (!host || own.has(host)) continue;
    fromBrowser.set(host, (fromBrowser.get(host) ?? 0) + 1);
  }
  const hosts = [...new Set([...fromProxy.keys(), ...fromBrowser.keys()])].filter((h) => !own.has(h));
  return hosts
    .map((host) => ({ host, count: Math.max(fromProxy.get(host) ?? 0, fromBrowser.get(host) ?? 0) }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
}

// `deps` exists so the report can be built in a test without an AI provider or a bucket.
export async function buildReport(job, {
  discover, pages, journeys, findings, observations, blockCounts,
  secretsInSandbox, containersUsed, writeRequestsBlocked, sandboxRuntime,
}, { emit = () => {}, upload: uploadFile = putScreenshot, summarize } = {}) {
  const thirdPartyHosts = thirdPartiesContacted(job, blockCounts);
  if (thirdPartyHosts.length) addFinding(findings, 'privacy.third_party_hosts', job.target.url, { hosts: thirdPartyHosts });
  for (const o of observations ?? []) {
    addFinding(findings, 'ai.observation', o.page, { title: o.title }, { title: `AI observation: ${o.title}`, why: o.detail, aiWritten: true });
  }

  const { score, grade } = scoreFindings(findings);
  const counts = countBySeverity(findings);
  findings.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  // Upload every screenshot (audited pages + journey steps + journey.failed evidence).
  // Base64 never stays in the job: it would be saved to disk and sent to the browser.
  let shotIndex = 0;
  const upload = async (b64) => {
    if (!b64) return null;
    try { return await uploadFile(job.id, ++shotIndex, Buffer.from(b64, 'base64')); }
    catch { emit('warning', { message: 'Could not store a screenshot' }); return null; }
  };

  const reportPages = [];
  for (const page of pages) {
    const screenshotUrl = await upload(page.screenshot);
    reportPages.push({ url: page.url, finalUrl: page.finalUrl, status: page.status, behindLogin: Boolean(page.behindLogin), timing: page.timing, screenshotUrl });
    delete page.screenshot;
  }
  for (const journey of journeys) {
    for (const step of journey.steps ?? []) {
      if (step.screenshotB64) { step.screenshotUrl = await upload(step.screenshotB64); delete step.screenshotB64; }
    }
  }
  for (const f of findings) {
    if (f.evidence?.screenshotB64) { f.evidence.screenshotUrl = await upload(f.evidence.screenshotB64); delete f.evidence.screenshotB64; }
  }

  const blocksByLayer = { input: 0, ai: 0, browser: 0, network: 0, resource: 0 };
  for (const ev of job.events) if (ev.type === 'blocked' && ev.data && ev.data.layer in blocksByLayer) blocksByLayer[ev.data.layer] += 1;
  // Only the proxy's own counts belong to the network layer; the browser-layer blocks are
  // already counted above and must not be added here a second time.
  const proxyBlocked = Object.values(blockCounts ?? {}).reduce((s, n) => s + (Number(n) || 0), 0);
  blocksByLayer.network = Math.max(blocksByLayer.network, proxyBlocked);

  let summary; let topActions; let summaryFromAi = false;
  try {
    const topFindings = findings.filter((f) => f.counted).slice(0, 10).map((f) => ({ title: f.title, severity: f.severity, page: f.page }));
    const journeyResults = journeys.map((j) => ({ title: j.title, status: j.status }));
    const user = JSON.stringify({ target: job.target.url, pagesAudited: reportPages.length, score, grade, counts, topFindings, journeys: journeyResults });
    const result = summarize
      ? await summarize({ system: SUMMARY_SYSTEM, user, schema: SummarySchema })
      : await llmJson({ system: SUMMARY_SYSTEM, schema: SummarySchema, user });
    const parsed = SummarySchema.parse(result);
    summary = parsed.summary.trim().slice(0, 900);
    topActions = parsed.topActions.slice(0, 3).map((a) => a.trim().slice(0, 200)).filter(Boolean);
    if (!summary || !topActions.length) throw new Error('empty summary');
    summaryFromAi = true;
  } catch {
    // Fail-soft (KAN-25): the measured findings and their built-in why/fix text are
    // untouched; only the written-for-humans fields fall back to a template.
    emit('warning', { message: 'AI summary unavailable; the report uses the built-in summary' });
    const fallback = buildFailSoftReportFields({
      host: job.target.host, pagesAudited: reportPages.length, score, grade, counts, findings,
    });
    summary = fallback.summary;
    topActions = fallback.topActions;
  }

  return {
    target: job.target.url, mode: job.mode, startedAt: job.createdAt, finishedAt: new Date().toISOString(),
    score, grade, counts, summary, topActions, journeys, pages: reportPages, findings, observations, thirdPartyHosts,
    containment: {
      mode: job.mode, writeRequestsBlocked, blocksByLayer,
      externalLinksNotFollowed: discover.externalLinks.length,
      secretsInSandbox, passwordInLogsOrReport: false,
      sandboxRuntime: sandboxRuntime || config.sandbox.runtime, containersUsed, hijackDrill: null,
      limits: { cpus: 1, memory: '1g', pids: 1024, tmp: '512m', readOnlyRoot: true, network: 'internal + egress allowlist' },
    },
    ai: { model: config.llm.model || null, visionModel: config.llm.visionModel || null, available: summaryFromAi || findings.some((f) => f.aiWritten) },
  };
}
