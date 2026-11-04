export const metadata = { title: 'How ShipCheck works' };

const STEPS = [
  ['Discover', 'A fresh sandboxed browser opens your home page and lists the pages it can find (links + sitemap).'],
  ['Plan', 'The AI (Vultr Serverless Inference) writes up to 5 user journeys and picks the key pages. Pages come only from the discovered list.'],
  ['Explore', 'The AI drives a real browser one action at a time: it reads the page, picks a click or some text to type, a code guard approves it, and the sandbox performs it. New pages it reaches are audited automatically.'],
  ['Analyze', 'The AI explains every problem in plain English and suggests a fix. Page text is treated as untrusted data.'],
  ['Prove-It', 'A clean sandbox re-runs the page checks. Only reproducible problems count as verified.'],
  ['Report', 'Score, summary, the journeys with screenshots, evidence, fixes and a containment log of everything blocked.'],
];
const LAYERS = [
  ['L1 Input guard', 'No localhost, private IPs, IP addresses, odd ports or passwords in URLs.'],
  ['L2 Action guard', 'Every AI action is one of 6 fixed types, checked before it runs: the element must exist, stay on the site, and never be a "Delete/Pay/Buy" button.'],
  ['L3 Browser guard', 'No navigation off the site; in safe mode, no form submissions or other write requests leave the sandbox; no service workers.'],
  ['L4 Network guard', 'No direct internet. An egress proxy allows only the site and common CDNs and blocks private and cloud-metadata addresses.'],
  ['L5 Secret guard', 'Zero secrets inside the sandbox. The AI key never enters it.'],
  ['L6 Resource guard', 'Fresh container per stage, destroyed after; CPU, memory, process and time limits; read-only; gVisor.'],
];

export default function HowItWorks() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">How ShipCheck works</h1>
      <img src="/architecture.png" alt="ShipCheck architecture diagram" className="mt-6 w-full rounded border" />
      <h2 className="mt-10 text-2xl font-bold">The agent loop</h2>
      <ol className="mt-4 space-y-3">{STEPS.map(([t, d], i) => <li key={t}><strong>{i + 1}. {t}:</strong> {d}</li>)}</ol>
      <h2 className="mt-10 text-2xl font-bold">Six safety layers</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {LAYERS.map(([t, d]) => <div key={t} className="rounded-xl border p-4"><h3 className="font-semibold">{t}</h3><p className="mt-1 text-sm text-gray-600">{d}</p></div>)}
      </div>
    </main>
  );
}
