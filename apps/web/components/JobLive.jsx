'use client';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    let closed = false;
    const source = new EventSource(eventsUrl(id));
    const load = () => getJob(id)
      .then((j) => {
        if (closed) return;
        setJob(j);
        setEvents((prev) => (j.events.length > prev.length ? j.events : prev));
        if (j.status === 'done' || j.status === 'failed') source.close();
      })
      .catch((err) => { if (!closed) setError(err.message); });
    load();
    source.onmessage = (msg) => {
      const ev = JSON.parse(msg.data);
      setEvents((prev) => (prev.some((p) => p.seq === ev.seq) ? prev : [...prev, ev]));
      if (ev.type === 'done' || ev.type === 'error') load();
    };
    source.onerror = () => load();
    return () => { closed = true; source.close(); };
  }, [id]);

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
