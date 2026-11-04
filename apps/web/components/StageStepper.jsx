const STAGES = ['queued', 'discovering', 'planning', 'exploring', 'analyzing', 'verifying', 'reporting', 'done'];

export default function StageStepper({ stage }) {
  const failed = stage === 'failed';
  const current = STAGES.indexOf(stage);
  return (
    <ol className="mt-6 flex flex-wrap gap-2 text-xs">
      {STAGES.map((s, i) => {
        let cls = 'bg-gray-100 text-gray-500';
        if (failed) cls = 'bg-gray-100 text-gray-400';
        else if (stage === 'done' || i < current) cls = 'bg-green-600 text-white';
        else if (i === current) cls = 'animate-pulse bg-black text-white';
        return <li key={s} className={`rounded-full px-3 py-1 capitalize ${cls}`}>{s}</li>;
      })}
      {failed && <li className="rounded-full bg-red-600 px-3 py-1 text-white">failed</li>}
    </ol>
  );
}
