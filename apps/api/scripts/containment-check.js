// Proves the sandbox network rules with real requests.
// Production:  docker compose exec api node scripts/containment-check.js
// Development: node --env-file=.env.development scripts/containment-check.js   (from apps/api)
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const ADMIN = process.env.PROXY_ADMIN_URL;
const TOKEN = process.env.INTERNAL_TOKEN;
const NETWORK = process.env.SANDBOX_NETWORK ?? 'shipcheck-sandbox';
const PROXY = process.env.SANDBOX_PROXY_URL ?? 'http://172.30.0.10:3128';
const jobToken = randomBytes(24).toString('hex');
const adminHeaders = { 'content-type': 'application/json', 'x-internal-token': TOKEN };
let failures = 0;

function curl(args) {
  const r = spawnSync('docker', ['run', '--rm', '--network', NETWORK, 'curlimages/curl:latest',
    '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '15', ...args], { encoding: 'utf8' });
  return (r.stdout || '').trim() || `error ${(r.stderr || '').trim()}`;
}

function expect(name, actual, ok) {
  const pass = ok(actual);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (got ${actual})`);
}

const reg = await fetch(`${ADMIN}/jobs`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ token: jobToken, jobId: '00000000-0000-0000-0000-000000000000', allowDomains: ['example.com', 'localtest.me'] }),
});
if (!reg.ok) throw new Error(`Could not register the test token (HTTP ${reg.status})`);

try {
  const auth = ['-x', PROXY, '-U', `${jobToken}:x`];
  expect('No direct internet from the sandbox network', curl(['https://example.com/']), (c) => c === '000' || c.startsWith('error'));
  expect('Proxy without a job token answers 407', curl(['-x', PROXY, 'http://example.com/']), (c) => c === '407');
  expect('Allowed host works through the proxy', curl([...auth, 'https://example.com/']), (c) => c === '200');
  expect('Host outside the allowlist is blocked', curl([...auth, 'https://attacker.example/']), (c) => c === '000' || c === '403');
  expect('Cloud metadata IP is blocked', curl([...auth, 'http://169.254.169.254/']), (c) => c === '403');
  expect('Allowed name that resolves to 127.0.0.1 is blocked', curl([...auth, 'http://localtest.me/']), (c) => c === '403');
  expect('Non-standard port is blocked', curl([...auth, 'https://example.com:8443/']), (c) => c === '000' || c === '403');
} finally {
  await fetch(`${ADMIN}/jobs/${jobToken}`, { method: 'DELETE', headers: adminHeaders }).catch(() => {});
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll containment checks passed');
process.exitCode = failures ? 1 : 0;
