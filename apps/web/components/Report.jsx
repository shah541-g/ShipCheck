'use client';
import { useState } from 'react';
import ScoreCard from './ScoreCard';
import JourneyCard from './JourneyCard';
import FindingCard from './FindingCard';
import { assetUrl, reportUrl } from '@/lib/api';

const FILTERS = ['all', 'critical', 'high', 'medium', 'low', 'info'];

export default function Report({ job }) {
  const r = job.report;
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState(false);
  const shown = r.findings.filter((f) => filter === 'all' || f.severity === filter);

  return (
    <section className="mt-10 space-y-8">
      <ScoreCard report={r} />
      {!r.ai.available && <p className="rounded bg-yellow-50 p-3 text-sm">AI explanations unavailable, built-in guidance shown. Journeys were not run.</p>}

      <div>
        <h2 className="text-xl font-bold">Summary</h2>
        <p className="mt-2">{r.summary}</p>
        <ol className="mt-3 list-decimal pl-6">{r.topActions.map((a, i) => <li key={i}>{a}</li>)}</ol>
      </div>

      <div className="flex flex-wrap gap-3">
        <a className="rounded border px-3 py-2 text-sm" href={reportUrl(job.id, 'md')}>Download Markdown</a>
        <a className="rounded border px-3 py-2 text-sm" href={reportUrl(job.id, 'json')}>Download JSON</a>
        <button type="button" className="rounded border px-3 py-2 text-sm"
          onClick={() => navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))}>
          {copied ? 'Link copied' : 'Copy share link'}
        </button>
      </div>

      {r.journeys.length > 0 && (
        <div>
          <h2 className="text-xl font-bold">User journeys</h2>
          <div className="mt-3 grid gap-3">{r.journeys.map((j) => <JourneyCard key={j.id} journey={j} />)}</div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold">Findings</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-sm capitalize ${filter === f ? 'bg-black text-white' : ''}`}>{f}</button>
          ))}
        </div>
        <div className="mt-4 grid gap-3">
          {shown.map((f) => <FindingCard key={f.id} finding={f} />)}
          {shown.length === 0 && <p className="text-sm text-gray-500">No findings in this group.</p>}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold">Pages audited</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {r.pages.map((p) => (
            <figure key={p.url} className="rounded border p-2">
              {p.screenshotUrl
                ? <img src={assetUrl(p.screenshotUrl)} alt={`Screenshot of ${p.url}`} className="w-full rounded" loading="lazy" />
                : <div className="flex h-40 items-center justify-center bg-gray-100 text-sm text-gray-500">No screenshot</div>}
              <figcaption className="mt-2 break-all text-xs">{p.status} · {p.url}{p.behindLogin ? ' · (behind login)' : ''}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      {r.thirdPartyHosts.length > 0 && (
        <div>
          <h2 className="text-xl font-bold">Third-party hosts blocked during the audit</h2>
          <ul className="mt-2 list-disc pl-6 text-sm">{r.thirdPartyHosts.map((h) => <li key={h.host}>{h.host} ({h.count})</li>)}</ul>
        </div>
      )}
    </section>
  );
}
