import UrlForm from '@/components/UrlForm';

const POINTS = [
  ['An AI that really tests', 'The agent clicks, types and follows real user journeys (like "start a free trial"), then tells you which ones break.'],
  ["Can't be hijacked", 'Every action runs in a fresh, locked sandbox with no secrets and no free internet. Hidden prompt injection is detected, not obeyed.'],
  ['Proof, not guesses', 'Each page finding comes with evidence and is re-checked in a second clean sandbox before it counts.'],
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center px-4 py-16 text-center">
      <h1 className="text-4xl font-bold sm:text-5xl">Is your website ready to launch?</h1>
      <p className="mt-4 max-w-2xl text-lg text-gray-600">
        ShipCheck is an AI agent that tests your site before launch like a real visitor, and it cannot be hijacked by the site it checks.
      </p>
      <div className="mt-8 flex w-full justify-center"><UrlForm /></div>
      <div className="mt-16 grid gap-6 text-left sm:grid-cols-3">
        {POINTS.map(([title, text]) => (
          <div key={title} className="rounded-xl border p-5">
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-gray-600">{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
