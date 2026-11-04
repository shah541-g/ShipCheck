// Drives one sandbox container through the real proxy using the v2 command protocol.
// Usage (from apps/api): node --env-file=.env.development scripts/sandbox-try.js https://demo.<IP>.sslip.io/
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline';

const target = new URL(process.argv[2] ?? 'https://example.com/');
const token = randomBytes(24).toString('hex');
const admin = process.env.PROXY_ADMIN_URL;
const headers = { 'content-type': 'application/json', 'x-internal-token': process.env.INTERNAL_TOKEN };
const host = target.hostname.replace(/^www\./, '');

const child = spawn('docker', ['run', '--rm', '-i', '--network', process.env.SANDBOX_NETWORK,
  '--memory', '1g', '--memory-swap', '1g', '--cpus', '1', '--pids-limit', '1024',
  '--read-only', '--tmpfs', '/tmp:rw,size=512m', '--shm-size', '512m',
  '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', process.env.SANDBOX_IMAGE]);
child.stderr.setEncoding('utf8').on('data', (d) => process.stderr.write(d));

const rl = readline.createInterface({ input: child.stdout });
const waiters = new Map();
let readyResolve;
const ready = new Promise((r) => { readyResolve = r; });
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.ready) return readyResolve();
  if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
});
let seq = 0;
const send = (cmd) => new Promise((resolve) => { const id = ++seq; waiters.set(id, resolve); child.stdin.write(`${JSON.stringify({ id, ...cmd })}\n`); });

const reg = await fetch(`${admin}/jobs`, { method: 'POST', headers, body: JSON.stringify({ token, jobId: '00000000-0000-0000-0000-000000000000', allowDomains: [host, `www.${host}`] }) });
if (!reg.ok) throw new Error(`Proxy register failed (HTTP ${reg.status})`);

try {
  child.stdin.write(`${JSON.stringify({ init: true, kind: 'explore', jobId: '00000000-0000-0000-0000-000000000000', mode: 'safe',
    proxy: { server: process.env.SANDBOX_PROXY_URL, username: token, password: 'x' },
    scope: { hosts: [host, `www.${host}`] },
    limits: { pageTimeoutMs: 20000, actionTimeoutMs: 15000, maxLinksPerPage: 30, maxCandidates: 50 },
    deadline: Date.now() + 120000 })}\n`);
  await ready;

  const disc = (await send({ cmd: 'discover', startUrl: target.toString() })).result;
  console.log('\nDISCOVER candidates:', disc.candidates?.length, '| external:', disc.externalLinks?.length, '| site:', disc.site, '| secrets:', disc.envSecretsCount);

  await send({ cmd: 'open', url: target.toString() });
  const snap = (await send({ cmd: 'snapshot' })).result;
  console.log('SNAPSHOT elements:', snap.elements?.length, '| first:', snap.elements?.[0]);

  const firstLink = snap.elements?.find((e) => e.tag === 'a');
  if (firstLink) {
    const act = (await send({ cmd: 'act', action: { action: 'click', n: firstLink.n } })).result;
    console.log(`ACT click "${firstLink.name}" -> newUrl:`, act.newUrl, '| nothingHappened:', act.nothingHappened);
  }

  const audit = (await send({ cmd: 'audit' })).result;
  console.log('AUDIT', audit.status, audit.url, '\n  findings:', audit.findings.map((f) => f.checkId).join(', '), '\n  screenshot:', Boolean(audit.screenshot));

  await send({ cmd: 'close' });
} finally {
  const res = await fetch(`${admin}/jobs/${token}`, { method: 'DELETE', headers });
  console.log('\nproxy block counts:', (await res.json()).counts);
  child.stdin.end();
}
