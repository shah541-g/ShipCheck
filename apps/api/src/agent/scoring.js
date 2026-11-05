const WEIGHTS = { critical: 15, high: 8, medium: 3, low: 1, info: 0 };

export function scoreFindings(findings) {
  const perCheck = new Map();
  let total = 0;
  for (const f of findings) {
    f.counted = false;
    if (f.severity === 'info' || f.verification === 'not_reproduced') continue;
    const n = perCheck.get(f.checkId) ?? 0;
    if (n >= 3) continue;
    perCheck.set(f.checkId, n + 1);
    f.counted = true;
    total += WEIGHTS[f.severity] ?? 0;
  }
  const score = Math.max(0, 100 - total);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  return { score, grade };
}

export function countBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) if (f.verification !== 'not_reproduced') counts[f.severity] += 1;
  return counts;
}
