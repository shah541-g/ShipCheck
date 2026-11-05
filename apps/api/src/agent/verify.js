// Prove-It matching for page findings. (Core: journeys are not replayed; a failed journey is
// "measured once". The Stretch section adds journey replay.)
export const findingKey = (checkId, page, evidence = {}) =>
  `${checkId}|${page}|${evidence.link ?? evidence.selector ?? evidence.text ?? ''}`;

export function pagesToVerify(findings) {
  return [...new Set(findings.filter((f) => f.verification === 'pending').map((f) => f.page))];
}

export function applyVerification(findings, verifyPages) {
  const seen = new Set();
  const checkedPages = new Set();
  for (const page of verifyPages) {
    checkedPages.add(page.url);
    for (const raw of page.findings ?? []) seen.add(findingKey(raw.checkId, page.url, raw.evidence));
  }
  for (const f of findings) {
    if (f.verification !== 'pending') continue;
    if (!checkedPages.has(f.page)) { f.verification = 'measured_once'; continue; }
    f.verification = seen.has(findingKey(f.checkId, f.page, f.evidence)) ? 'verified' : 'not_reproduced';
  }
}

export function markAllMeasuredOnce(findings) {
  for (const f of findings) if (f.verification === 'pending') f.verification = 'measured_once';
}
