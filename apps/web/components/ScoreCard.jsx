const GRADE_COLORS = { A: 'bg-green-600', B: 'bg-lime-600', C: 'bg-yellow-500', D: 'bg-orange-500', F: 'bg-red-600' };

export default function ScoreCard({ report }) {
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-xl border p-6">
      <div className={`flex h-24 w-24 flex-col items-center justify-center rounded-full text-white ${GRADE_COLORS[report.grade]}`}>
        <span className="text-3xl font-bold">{report.score}</span>
        <span className="text-sm">grade {report.grade}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
        {['critical', 'high', 'medium', 'low'].map((s) => (
          <div key={s}><dt className="capitalize text-gray-500">{s}</dt><dd className="text-xl font-semibold">{report.counts[s]}</dd></div>
        ))}
      </dl>
    </div>
  );
}
