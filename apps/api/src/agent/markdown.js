const clean = (value) => String(value).replace(/`/g, "'");

export function toMarkdown(job) {
  const r = job.report;
  const lines = [
    `# ShipCheck report: ${job.target.host}`, '',
    `- Audited: ${r.target}`, `- Mode: ${r.mode}`, `- Finished: ${r.finishedAt}`,
    `- Score: **${r.score}/100** (grade **${r.grade}**)`, `- Pages audited: ${r.pages.length}`, '',
    '## Summary', '', r.summary, '',
    '## Top actions', '', ...r.topActions.map((a, i) => `${i + 1}. ${a}`), '',
  ];
  if (r.journeys.length) {
    lines.push('## User journeys', '');
    for (const j of r.journeys) lines.push(`- **${j.title}** — ${j.status}${j.reason ? `: ${j.reason}` : ''}`);
    lines.push('');
  }
  lines.push('## Findings', '');
  for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
    const list = r.findings.filter((f) => f.severity === severity);
    if (!list.length) continue;
    lines.push(`### ${severity[0].toUpperCase()}${severity.slice(1)} (${list.length})`, '');
    for (const f of list) {
      lines.push(`- **${f.title}** (${f.verification.replace('_', ' ')})`, `  - Page: ${f.page}`,
        `  - Evidence: \`${clean(JSON.stringify(f.evidence))}\``, `  - Why: ${f.why}`, `  - Fix: ${f.fix}`);
    }
    lines.push('');
  }
  const c = r.containment;
  lines.push('## Containment', '',
    `- Mode: ${c.mode} (write requests blocked: ${c.writeRequestsBlocked})`,
    `- Blocks by layer: ${Object.entries(c.blocksByLayer).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `- External links not followed: ${c.externalLinksNotFollowed}`,
    `- Secrets inside sandbox: ${c.secretsInSandbox}`,
    `- Sandbox runtime: ${c.sandboxRuntime}`, `- Fresh containers used: ${c.containersUsed}`, '');
  return lines.join('\n');
}
