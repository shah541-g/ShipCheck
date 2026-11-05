import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFinding, buildFindings } from '../src/agent/findings.js';
import { journeyToFinding } from '../src/agent/journeys.js';
import { ruleFor } from '../src/agent/rules.js';

const discover = { startUrl: 'https://a.com/', site: { robotsTxt: true, sitemap: true } };

test('a finding takes its severity and texts from the rule, not from the caller', () => {
  const findings = [];
  const f = addFinding(findings, 'links.broken', 'https://a.com/', { link: 'https://a.com/gone' });
  assert.equal(f.id, 'f1');
  assert.equal(f.severity, 'high');
  assert.equal(f.category, 'links');
  assert.equal(f.verification, 'pending');     // links.broken is verifiable
  assert.equal(f.aiWritten, false);
  assert.equal(f.counted, false);
  assert.match(f.fix, /redirect/);
});

test('a check that cannot be replayed starts out measured once', () => {
  const findings = [];
  assert.equal(addFinding(findings, 'perf.slow_lcp', 'https://a.com/').verification, 'measured_once');
  assert.equal(addFinding(findings, 'journey.failed', 'https://a.com/').verification, 'measured_once');
});

test('axe rules get a severity from their impact and an unknown check stays low', () => {
  assert.equal(ruleFor('a11y.color-contrast', { impact: 'serious', help: 'Elements must have enough contrast' }).severity, 'medium');
  assert.equal(ruleFor('a11y.image-alt', { impact: 'critical' }).severity, 'high');
  assert.equal(ruleFor('a11y.region', {}).severity, 'low');
  assert.match(ruleFor('a11y.color-contrast', { help: 'Elements must have enough contrast' }).title, /^Accessibility: /);
  const unknown = ruleFor('something.new');
  assert.equal(unknown.severity, 'low');
  assert.equal(unknown.verifiable, false);
});

test('a failed journey becomes a journey.failed finding, a passed one does not', () => {
  const steps = [
    { n: 1, fromUrl: 'https://a.com/', toUrl: 'https://a.com/pricing', newErrors: [] },
    { n: 2, fromUrl: 'https://a.com/pricing', toUrl: 'https://a.com/signup', newErrors: ['http: 404 https://a.com/signup'], screenshotB64: 'AAA' },
  ];
  const failed = journeyToFinding({ title: 'Start free trial', status: 'failed', failedStep: 2, reason: 'The signup page is missing', steps }, 'https://a.com/');
  assert.equal(failed.checkId, 'journey.failed');
  assert.equal(failed.page, 'https://a.com/signup');
  assert.equal(failed.evidence.kind, 'error_page');
  assert.equal(failed.evidence.failedStep, 2);
  assert.equal(failed.evidence.screenshotB64, 'AAA');
  assert.equal(journeyToFinding({ title: 'Contact form', status: 'passed', steps }, 'https://a.com/'), null);
});

test('the reason a journey failed is read from the failing step', () => {
  const kind = (step, status = 'failed') => journeyToFinding(
    { title: 'j', status, failedStep: 1, steps: [{ n: 1, toUrl: 'https://a.com/x', ...step }] }, 'https://a.com/',
  ).evidence.kind;
  assert.equal(kind({ newErrors: ['js: Cannot read properties of null'] }), 'js_error');
  assert.equal(kind({ newErrors: ['http: 500 https://a.com/x'] }), 'error_page');
  assert.equal(kind({ newErrors: [], nothingHappened: true }), 'click_did_nothing');
  assert.equal(kind({ newErrors: [] }), 'ai_judged');
  assert.equal(kind({ newErrors: [] }, 'stopped_by_guard'), 'stopped_by_guard');
});

test('a guard-stopped journey with no steps still lands on the target page', () => {
  const f = journeyToFinding({ title: 'Buy now', status: 'stopped_by_guard', reason: 'Dangerous action blocked', steps: [] }, 'https://a.com/');
  assert.equal(f.page, 'https://a.com/');
  assert.equal(f.evidence.detail, 'Dangerous action blocked');
  assert.equal(f.evidence.screenshotB64, null);
});

test('buildFindings joins the page checks, the site checks and the journeys', () => {
  const pages = [
    { url: 'https://a.com/', findings: [{ checkId: 'seo.title_missing', evidence: {} }, { checkId: 'links.broken', evidence: { link: 'https://a.com/gone' } }] },
    { url: 'https://a.com/pricing', findings: [] },
  ];
  const journeys = [
    { title: 'Start free trial', status: 'failed', failedStep: 1, reason: 'nothing happened', steps: [{ n: 1, toUrl: 'https://a.com/pricing', newErrors: [], nothingHappened: true }] },
    { title: 'Contact form', status: 'passed', steps: [] },
  ];
  const findings = buildFindings({ startUrl: 'https://a.com/', site: { robotsTxt: false, sitemap: false } }, pages, journeys, 'https://a.com/');
  assert.deepEqual(findings.map((f) => f.checkId),
    ['seo.title_missing', 'links.broken', 'site.robots_missing', 'site.sitemap_missing', 'journey.failed']);
  assert.deepEqual(findings.map((f) => f.id), ['f1', 'f2', 'f3', 'f4', 'f5']);
});

test('a site with robots.txt and a sitemap gets neither site finding', () => {
  assert.deepEqual(buildFindings(discover, [], [], 'https://a.com/'), []);
});
