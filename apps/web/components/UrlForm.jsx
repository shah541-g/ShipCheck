'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createJob, getConfig } from '@/lib/api';

export default function UrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoUrl, setDemoUrl] = useState(null);

  useEffect(() => { getConfig().then((c) => setDemoUrl(c.demoUrl)).catch(() => {}); }, []);

  async function start(target) {
    setBusy(true); setError('');
    try { const id = await createJob(target); router.push(`/jobs/${id}`); }
    catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={(e) => { e.preventDefault(); start(url); }} className="flex gap-2">
        <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-site.com" aria-label="Website URL" className="flex-1 rounded-lg border px-4 py-3" />
        <button disabled={busy} className="rounded-lg bg-black px-5 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? 'Starting…' : 'Audit'}
        </button>
      </form>
      {demoUrl && (
        <button type="button" disabled={busy} onClick={() => start(demoUrl)} className="mt-3 text-sm underline">
          Try the demo site (watch the agent find a broken signup and get blocked)
        </button>
      )}
      {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
    </div>
  );
}
