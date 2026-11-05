// Journey status values and the mapping from a failed journey to a journey.failed finding.
export const FAILED_STATUSES = new Set(['failed', 'stopped_by_guard']);

export function journeyToFinding(journey, targetUrl) {
  if (!FAILED_STATUSES.has(journey.status)) return null;
  const steps = journey.steps ?? [];
  const failStep = steps.find((s) => s.n === journey.failedStep) ?? steps.at(-1) ?? null;
  const page = failStep?.toUrl || failStep?.fromUrl || targetUrl;
  let kind = 'ai_judged';
  if (journey.status === 'stopped_by_guard') kind = 'stopped_by_guard';
  else if (failStep) {
    const errs = (failStep.newErrors ?? []).join(' ');
    if (/\b4\d\d\b|\b5\d\d\b|^http:|\shttp:/.test(errs)) kind = 'error_page';
    else if (/\bjs:/.test(errs)) kind = 'js_error';
    else if (failStep.nothingHappened) kind = 'click_did_nothing';
  }
  return {
    checkId: 'journey.failed',
    page,
    evidence: { journey: journey.title, failedStep: journey.failedStep ?? null, kind,
      detail: journey.reason || 'The journey could not be completed.', screenshotB64: failStep?.screenshotB64 ?? null },
  };
}
