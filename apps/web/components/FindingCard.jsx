const SEVERITY = {
  critical: 'bg-red-600 text-white', high: 'bg-orange-500 text-white', medium: 'bg-yellow-400 text-black',
  low: 'bg-gray-300 text-black', info: 'bg-blue-100 text-blue-900',
};
const VERIFY = {
  verified: ['Verified', 'bg-green-100 text-green-800'],
  not_reproduced: ['Not reproduced', 'bg-gray-100 text-gray-500'],
  measured_once: ['Measured once', 'bg-blue-50 text-blue-800'],
};

export default function FindingCard({ finding: f }) {
  const [label, cls] = VERIFY[f.verification] ?? VERIFY.measured_once;
  return (
    <article className={`rounded-lg border p-4 ${f.verification === 'not_reproduced' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${SEVERITY[f.severity]}`}>{f.severity}</span>
        <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{label}</span>
        {f.aiWritten && <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800">AI-written</span>}
      </div>
      <h3 className="mt-2 font-semibold">{f.title}</h3>
      <a href={f.page} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-blue-700 underline">{f.page}</a>
      <p className="mt-2 text-sm"><strong>Why it matters:</strong> {f.why}</p>
      <p className="mt-1 text-sm"><strong>How to fix:</strong> {f.fix}</p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-gray-600">Evidence</summary>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-gray-50 p-2">{JSON.stringify(f.evidence, null, 2)}</pre>
      </details>
    </article>
  );
}
