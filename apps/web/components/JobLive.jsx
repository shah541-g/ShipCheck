'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { eventsUrl, getJob } from '@/lib/api';
import StageStepper from './StageStepper';
import Timeline from './Timeline';
import AgentView from './AgentView';
import ContainmentPanel from './ContainmentPanel';
import Report from './Report';

export default function JobLive({ id }) {
  const [events, setEvents] = useState([]);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let closed = false;
    const source = new EventSource(eventsUrl(id));
    const stop = () => { closed = true; source.close(); };
    const load = () => getJob(id)
      .then((j) => {
        if (closed) return;
        setJob(j);
        setEvents((prev) => (j.events.length > prev.length ? j.events : prev));
        if (j.status === 'done' || j.status === 'failed') source.close();
      })
      .catch((err) => {
        if (closed) return;
        setError(err.message);
        // There is no such audit, so retrying only produces more 404s. The event
        // stream is already dead for the same reason: close it and say so plainly.
        if (/not found/i.test(err.message)) { setGone(true); stop(); }
      });
    load();
    source.onmessage = (msg) => {
      const ev = JSON.parse(msg.data);
      setEvents((prev) => (prev.some((p) => p.seq === ev.seq) ? prev : [...prev, ev]));
      if (ev.type === 'done' || ev.type === 'error') load();
    };
    source.onerror = () => { if (!closed) load(); };
    return stop;
  }, [id]);

  if (gone) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Audit not found</h1>
        <p className="mt-3 text-gray-600">
          This link is wrong, or the audit it points to is no longer on the server. Audits are kept per server, so a link from a different deployment will not open here.
        </p>
        <Link href="/" className="mt-8 inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white">Audit a site</Link>
      </main>
    );
  }

  const lastStage = [...events].reverse().find((e) => e.type === 'stage')?.data?.stage;
  const failed = job?.status === 'failed' || events.some((e) => e.type === 'error');
  const stage = failed ? 'failed' : (lastStage ?? job?.status ?? 'queued');

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="break-all text-2xl font-bold">Auditing {job?.target?.host ?? '…'}</h1>
      {error && <p className="mt-2 text-red-600" role="alert">{error}</p>}
      <StageStepper stage={stage} />
      <AgentView events={events} />
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <section className="md:col-span-2"><Timeline events={events} /></section>
        <aside><ContainmentPanel events={events} report={job?.report} /></aside>
      </div>
      {failed && job?.error && <p className="mt-6 rounded bg-red-50 p-4 text-red-700">{job.error.message}</p>}
      {job?.report && <Report job={job} />}
    </main>
  );
}
