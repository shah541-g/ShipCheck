const LAYERS = [
  ['input', 'L1 Input guard'], ['ai', 'L2 Action guard'], ['browser', 'L3 Browser guard'],
  ['network', 'L4 Network guard'], ['resource', 'L6 Resource guard'],
];

export default function ContainmentPanel({ events, report }) {
  const blocked = events.filter((e) => e.type === 'blocked');
  const c = report?.containment;
  const count = (layer) => (c ? c.blocksByLayer[layer] : blocked.filter((e) => e.data?.layer === layer).length);
  return (
    <div className={`rounded-xl border-2 p-4 ${blocked.length ? 'border-red-500' : 'border-gray-200'}`}>
      <h2 className="font-bold">Containment</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {LAYERS.map(([key, label]) => (
          <li key={key} className="flex justify-between">
            <span>{label}</span>
            <span className={count(key) ? 'font-bold text-red-600' : 'text-gray-500'}>{count(key)}</span>
          </li>
        ))}
        <li className="flex justify-between"><span>L5 Secrets inside sandbox</span>
          <span className="font-bold text-green-700">{c ? c.secretsInSandbox : '…'}</span></li>
      </ul>
      {c && (
        <p className="mt-3 text-xs text-gray-600">
          Mode: {c.mode} · Writes blocked: {c.writeRequestsBlocked} · Runtime: {c.sandboxRuntime} · Fresh containers: {c.containersUsed} ·
          External links not followed: {c.externalLinksNotFollowed}
        </p>
      )}
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {blocked.map((e) => <li key={e.seq} className="break-words rounded bg-red-50 p-2 text-xs text-red-800">{e.message}</li>)}
      </ul>
    </div>
  );
}
