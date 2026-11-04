import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { config } from '../config.js';

export class SandboxError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Per-command timeouts: audit/discover do a lot (axe + link checks), so they get longer budgets.
function commandTimeout(cmd) {
  if (cmd === 'audit') return config.limits.pageTimeoutMs * 2 + 60000;
  if (cmd === 'discover') return config.limits.discoverTimeoutMs;
  return config.limits.actionTimeoutMs + 5000;
}

// Starts ONE fresh, locked container as a command server for one stage and returns a driver.
// No -e, no -v, no docker socket: the sandbox gets zero ShipCheck secrets (L5). Limits = L6.
export function startSandbox({ jobId, stage, init, onEvent, stageTimeoutMs }) {
  const name = `shipcheck-job-${jobId.slice(0, 8)}-${stage}`;
  const args = [
    'run', '--rm', '-i', '--name', name,
    '--network', config.sandbox.network,
    '--memory', '1g', '--memory-swap', '1g', '--cpus', '1', '--pids-limit', '1024',
    '--read-only', '--tmpfs', '/tmp:rw,size=512m', '--shm-size', '512m',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    ...(config.sandbox.runtime === 'runsc' ? ['--runtime', 'runsc'] : []),
    config.sandbox.image,
  ];
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});           // EPIPE if the container dies before we write
  child.stderr.setEncoding('utf8');

  let dead = false; let deadError = null; let secretsInSandbox = 0;
  let seq = 0;
  const waiters = new Map();
  let readyResolve; let readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });

  function fail(code, message) {
    if (dead) return;
    dead = true; deadError = new SandboxError(code, message);
    readyReject(deadError);
    for (const w of waiters.values()) w.reject(deadError);
    waiters.clear();
  }

  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    let msg; try { msg = JSON.parse(line); } catch { return; }
    if (msg.ready) return readyResolve();
    if (msg.fatal) return fail('bad_output', msg.fatal);
    const sc = msg.result?.envSecretsCount ?? msg.envSecretsCount;
    if (typeof sc === 'number') secretsInSandbox = Math.max(secretsInSandbox, sc);
    const w = msg.id && waiters.get(msg.id);
    if (w) { waiters.delete(msg.id); w.resolve(msg); }
  });

  let errBuf = '';
  child.stderr.on('data', (d) => {
    errBuf += d;
    let nl;
    while ((nl = errBuf.indexOf('\n')) >= 0) {
      const line = errBuf.slice(0, nl).trim();
      errBuf = errBuf.slice(nl + 1);
      if (!line.startsWith('{')) continue;
      try { const ev = JSON.parse(line); if (ev && typeof ev.type === 'string') onEvent?.(ev); } catch { /* not ours */ }
    }
  });

  child.on('error', (err) => fail('docker_unavailable', `Could not start Docker: ${err.message}`));
  child.on('close', (code) => {
    if (code === 137) fail('resource_limit', `the ${stage} stage reached the memory limit and the container was destroyed`);
    else if (!dead) fail('closed', `the ${stage} container exited unexpectedly (code ${code})`);
  });

  const stageTimer = setTimeout(() => {
    spawn('docker', ['kill', name], { stdio: 'ignore' }).on('error', () => {});
    fail('timeout', `the ${stage} stage hit its ${Math.round(stageTimeoutMs / 1000)} s limit and the container was destroyed`);
  }, stageTimeoutMs);

  function send(cmd) {
    if (dead) return Promise.reject(deadError);
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(id); reject(new SandboxError('action_timeout', `the ${cmd.cmd} command timed out`)); }, commandTimeout(cmd.cmd));
      waiters.set(id, {
        resolve: (m) => { clearTimeout(timer); resolve(m); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      try { child.stdin.write(`${JSON.stringify({ id, ...cmd })}\n`); } catch (e) { clearTimeout(timer); reject(new SandboxError('write_failed', e.message)); }
    });
  }

  async function act(cmd) {
    const reply = await send(cmd);
    if (!reply.ok) throw new SandboxError('command_failed', reply.error || `the ${cmd.cmd} command failed`);
    return reply.result;
  }

  async function close() {
    clearTimeout(stageTimer);
    if (!dead) { try { await send({ cmd: 'close' }); } catch { /* ignore */ } }
    try { child.stdin.end(); } catch { /* ignore */ }
  }

  child.stdin.write(`${JSON.stringify(init)}\n`);       // init is the first line

  return {
    ready: () => ready,
    act,
    close,
    get secretsInSandbox() { return secretsInSandbox; },
  };
}

// Used by /api/health: true when `docker <args>` exits with code 0.
export function dockerCheck(args) {
  return new Promise((resolve) => {
    const p = spawn('docker', args, { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}
