'use client';
import { useEffect, useRef } from 'react';

const STYLE = {
  stage: 'font-semibold text-black', progress: 'text-gray-700', agent_step: 'text-indigo-700',
  journey: 'font-semibold text-indigo-900', finding: 'text-orange-700', blocked: 'font-semibold text-red-700',
  warning: 'text-yellow-700', error: 'font-semibold text-red-700', done: 'font-semibold text-green-700',
};

export default function Timeline({ events }) {
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [events.length]);
  return (
    <div ref={box} className="h-96 overflow-y-auto rounded-xl border bg-gray-50 p-4 font-mono text-xs" aria-live="polite">
      {events.length === 0 && <p className="text-gray-500">Connecting…</p>}
      {events.map((e) => (
        <p key={e.seq} className={`break-words ${STYLE[e.type] ?? ''}`}>
          <span className="text-gray-400">{new Date(e.ts).toLocaleTimeString()} </span>{e.message}
        </p>
      ))}
    </div>
  );
}
