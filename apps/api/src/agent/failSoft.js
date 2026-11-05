const JOURNEY_STATUSES = new Set(['run', 'partially_run', 'not_run']);
const COUNT_KEYS = ['critical', 'high', 'medium', 'low', 'info'];

function count(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function resolveJourneyReportStatus(planAi, exploreAi) {
  if (planAi?.planningAvailable === false || planAi?.journeysStatus === 'not_run') return 'not_run';
  const status = exploreAi?.journeysStatus;
  return JOURNEY_STATUSES.has(status) ? status : 'not_run';
}

// Returns only the report fields whose normal values depend on an AI call.
// Deterministic findings and their built-in why/fix text are deliberately untouched.
export function buildFailSoftReportFields({
  host,
  pagesAudited,
  score,
  grade,
  counts = {},
  findings = [],
  model = null,
  visionModel = null,
  aiAvailable = false
} = {}) {
  const safeCounts = Object.fromEntries(COUNT_KEYS.map((key) => [key, count(counts[key])]));
  const total = safeCounts.critical + safeCounts.high + safeCounts.medium + safeCounts.low;
  const audited = count(pagesAudited);
  const site = String(host || 'the site').replace(/[\r\n<>]/g, '').slice(0, 253);
  const safeScore = count(score);
  const safeGrade = String(grade || '—').replace(/[\r\n<>]/g, '').slice(0, 12);
  const usableFindings = (Array.isArray(findings) ? findings : []).filter((finding) => finding && finding.counted !== false);
  const topActions = usableFindings.slice(0, 3).map((finding) => {
    const title = String(finding.title || finding.checkId || 'Review this finding').replace(/[\r\n<>]/g, '').slice(0, 180);
    const page = String(finding.page || '').replace(/[\r\n<>]/g, '').slice(0, 300);
    return page ? `${title} (${page})` : title;
  });
  if (topActions.length === 0) topActions.push('Review the audited pages and rerun the checks after any changes.');

  return {
    summary: `ShipCheck audited ${audited} pages of ${site} and found ${total} issues `
      + `(${safeCounts.critical} critical, ${safeCounts.high} high, ${safeCounts.medium} medium, ${safeCounts.low} low). `
      + `Score ${safeScore} (grade ${safeGrade}).`,
    topActions,
    ai: {
      model: model || null,
      visionModel: visionModel || null,
      available: Boolean(aiAvailable)
    }
  };
}
