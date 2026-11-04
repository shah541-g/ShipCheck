import { assetUrl } from '@/lib/api';

const STATUS = {
  passed: ['Passed', 'bg-green-100 text-green-800'],
  failed: ['Failed', 'bg-red-100 text-red-800'],
  stopped_by_guard: ['Stopped by guard', 'bg-orange-100 text-orange-800'],
  not_finished: ['Not finished', 'bg-gray-100 text-gray-600'],
};

export default function JourneyCard({ journey }) {
  const [label, cls] = STATUS[journey.status] ?? STATUS.not_finished;
  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>
        <h3 className="font-semibold">{journey.title}</h3>
      </div>
      {journey.reason && <p className="mt-1 text-sm text-gray-600">{journey.reason}</p>}
      <ol className="mt-3 space-y-1 text-xs text-gray-700">
        {journey.steps.map((s) => (
          <li key={s.n} className={s.verdict === 'blocked' ? 'text-red-700' : ''}>
            {s.n}. {s.action}{s.targetName ? ` "${s.targetName}"` : ''}{s.verdict === 'blocked' ? ` — BLOCKED (${s.detail})` : s.nothingHappened ? ' — nothing happened' : s.toUrl && s.toUrl !== s.fromUrl ? ` → ${s.toUrl}` : ''}
          </li>
        ))}
      </ol>
      {journey.steps.some((s) => s.screenshotUrl) && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {journey.steps.filter((s) => s.screenshotUrl).map((s) => (
            <img key={s.n} src={assetUrl(s.screenshotUrl)} alt={`Step ${s.n} of ${journey.title}`} className="h-28 rounded border" loading="lazy" />
          ))}
        </div>
      )}
    </article>
  );
}
