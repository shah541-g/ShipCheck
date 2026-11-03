import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: "ShipCheck: pre-launch website testing by an AI agent that can't be hijacked",
  description: 'ShipCheck tests your website before launch like a real visitor: it clicks, types and follows user journeys, finds broken flows, errors, SEO and accessibility problems and prompt injection, with every action sandboxed on Vultr.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <header className="border-b">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold">ShipCheck</Link>
            <Link href="/how-it-works" className="text-sm underline">How it works</Link>
          </nav>
        </header>
        {children}
        <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-gray-500">
          Built for the Vultr Agent Rush Hackathon. Runs on Vultr Cloud Compute, Serverless Inference and Object Storage.
        </footer>
      </body>
    </html>
  );
}
