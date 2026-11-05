import { ruleFor } from './rules.js';
import { journeyToFinding } from './journeys.js';

export function addFinding(findings, checkId, page, evidence = {}, extra = {}) {
  const rule = ruleFor(checkId, evidence);
  const finding = {
    id: `f${findings.length + 1}`, checkId, title: rule.title, category: rule.category, severity: rule.severity,
    page, evidence, why: rule.why, fix: rule.fix, aiWritten: false,
    verification: rule.verifiable ? 'pending' : 'measured_once', counted: false, ...extra,
  };
  findings.push(finding);
  return finding;
}

export function buildFindings(discover, pages, journeys, targetUrl) {
  const findings = [];
  for (const page of pages) {
    for (const raw of page.findings ?? []) addFinding(findings, raw.checkId, page.url, raw.evidence ?? {});
  }
  if (!discover.site.robotsTxt) addFinding(findings, 'site.robots_missing', discover.startUrl);
  if (!discover.site.sitemap) addFinding(findings, 'site.sitemap_missing', discover.startUrl);
  for (const journey of journeys ?? []) {
    const jf = journeyToFinding(journey, targetUrl);
    if (jf) addFinding(findings, jf.checkId, jf.page, jf.evidence);
  }
  return findings;
}
