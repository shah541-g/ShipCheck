'use client';
// Shows the live "agent is driving" feed: each step's reason, action and the guard verdict.
export default function AgentView({ events }) {
  const steps = events.filter((e) => e.type === 'agent_step');
  if (steps.length === 0) return null;
  const recent = steps.slice(-8);
  return (
    <div className="mt-6 rounded-xl border bg-slate-900 p-4 text-slate-100">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Agent view — the AI is driving the browser</h2>
      <ul className="mt-3 space-y-2">
        {recent.map((e) => {
          const d = e.data ?? {};
          const blocked = d.verdict === 'blocked';
          return (
            <li key={e.seq} className="rounded-lg bg-slate-800 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-700 px-2 py-0.5 text-xs">{d.journey}</span>
                <span className="font-mono text-xs text-slate-300">step {d.step}</span>
                <span className="font-semibold">{d.action}{d.targetName ? `: "${d.targetName}"` : ''}</span>
                <span className={`ml-auto rounded px-2 py-0.5 text-xs font-bold ${blocked ? 'bg-red-600' : 'bg-green-600'}`}>
                  {blocked ? 'BLOCKED' : 'ALLOWED'}
                </span>
              </div>
              {d.reason && <p className="mt-1 text-xs text-slate-300">“{d.reason}”</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
