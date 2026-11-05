import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { config } from '../config.js';
import { checkAction } from '../security/actionGuard.js';
import { isInScope } from '../security/policy.js';
import { registerJob, unregisterJob } from './proxyClient.js';

const STAGES = new Set(['discover', 'explore', 'verify']);
const COMMANDS = new Set(['discover', 'open', 'snapshot', 'act', 'audit']);
const EVENT_TYPES = new Set(['progress', 'blocked', 'warning']);
const BLOCK_LAYERS = new Set(['input', 'ai', 'browser', 'network', 'resource']);
const MAX_STDOUT_LINE = 16 * 1024 * 1024;
const MAX_STDERR_LINE = 64 * 1024;

export class SandboxError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SandboxError';
    this.code = code;
  }
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateName(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new SandboxError('invalid_config', `${label} is invalid`);
  return value;
}

function normalizeHosts(hosts) {
  if (!Array.isArray(hosts) || hosts.length === 0 || hosts.length > 20) {
    throw new SandboxError('invalid_scope', 'Sandbox needs an explicit site host allowlist');
  }
  const unique = new Set();
  for (const raw of hosts) {
    const host = String(raw).toLowerCase().replace(/\.$/, '');
    if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)
      || host.includes('..') || net.isIP(host)) {
      throw new SandboxError('invalid_scope', 'Sandbox site host allowlist is invalid');
    }
    unique.add(host);
  }
  return [...unique];
}

function validateProxyServer(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new SandboxError('proxy_unavailable', 'Sandbox egress proxy URL is not configured'); }
  if (url.protocol !== 'http:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || net.isIP(url.hostname) !== 4 || !url.port) {
    throw new SandboxError('invalid_config', 'Sandbox egress proxy must use an unauthenticated HTTP IPv4 address and port');
  }
  return url.toString().replace(/\/$/, '');
}

function validateRegisteredProxy(initProxy, proxyServer) {
  if (initProxy === undefined) return null;
  if (!initProxy || typeof initProxy !== 'object' || Array.isArray(initProxy)
    || !/^[a-f0-9]{64}$/i.test(initProxy.username || '')) {
    throw new SandboxError('invalid_config', 'Registered sandbox proxy configuration is invalid');
  }
  let suppliedServer;
  try { suppliedServer = validateProxyServer(initProxy.server); }
  catch { throw new SandboxError('invalid_config', 'Registered sandbox proxy configuration is invalid'); }
  if (suppliedServer !== proxyServer) {
    throw new SandboxError('invalid_config', 'Registered sandbox proxy configuration is invalid');
  }
  return initProxy.username;
}

function makeInit({ jobId, stage, init, hosts, proxyServer, proxyToken, limits, deadline }) {
  const mode = init.mode ?? 'safe';
  if (!['safe', 'staging'].includes(mode)) throw new SandboxError('invalid_mode', 'Sandbox mode is invalid');
  return {
    init: true,
    kind: stage,
    jobId,
    mode,
    proxy: { server: proxyServer, username: proxyToken, password: 'x' },
    scope: { hosts },
    limits,
    deadline
  };
}

function commandTimeout(cmd, limits) {
  if (cmd === 'audit') return limits.auditCommandTimeoutMs;
  if (cmd === 'discover') return limits.discoverTimeoutMs;
  return limits.actionTimeoutMs + 5000;
}

function safeEvent(type, event, proxyToken) {
  const redact = (value) => redactRunnerText(value, proxyToken, config.llm.apiKey, config.internalToken).slice(0, 2000);
  if (!EVENT_TYPES.has(type)) return null;
  if (type === 'blocked') {
    const layer = BLOCK_LAYERS.has(event.layer) ? event.layer : 'browser';
    const target = redact(event.target);
    const reason = redact(event.reason);
    return { type, data: { layer, ...(target ? { target } : {}), reason }, message: `BLOCKED (${layer}): ${reason}` };
  }
  if (type === 'warning') {
    const message = redact(event.message || 'Sandbox warning');
    return { type, data: { message }, message };
  }
  const message = redact(event.message || 'Sandbox progress');
  const url = typeof event.url === 'string' ? redact(event.url) : undefined;
  return { type, data: { message, ...(url ? { url } : {}) }, message };
}

function redactRunnerText(value, ...secrets) {
  let text = String(value ?? '').slice(0, 1000);
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, '[redacted]');
  return text;
}

function captureDocker(spawnProcess, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let child;
    let stdout = '';
    let settled = false;
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    try {
      child = spawnProcess('docker', args, { stdio: ['ignore', 'pipe', 'ignore'], shell: false, windowsHide: true });
    } catch {
      finish(new SandboxError('docker_unavailable', 'Could not start Docker'));
      return;
    }
    child.stdout?.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-4096); });
    child.on('error', () => finish(new SandboxError('docker_unavailable', 'Could not start Docker')));
    child.on('close', (code) => code === 0
      ? finish(null, stdout.trim())
      : finish(new SandboxError('docker_command_failed', `Docker command failed (exit ${code ?? 'unknown'})`)));
    timer = setTimeout(() => {
      child.kill?.('SIGKILL');
      finish(new SandboxError('docker_timeout', 'Docker command timed out'));
    }, timeoutMs);
  });
}

async function inspectInternalNetwork(spawnProcess, network) {
  let internal;
  try {
    internal = await captureDocker(spawnProcess, ['network', 'inspect', '--format={{.Internal}}', network], 5000);
  } catch (error) {
    if (error instanceof SandboxError) throw error;
    throw new SandboxError('network_unavailable', 'Could not verify the sandbox Docker network');
  }
  if (internal !== 'true') {
    throw new SandboxError('network_not_internal', 'Sandbox will not start: its Docker network must be internal');
  }
}

function createRunnerProcess({
  spawnProcess, args, initLine, name, stage, limits, scopeHosts, mode, proxyToken,
  onEvent, onFailure, commandTimeouts = {}, readyTimeoutMs, closeTimeoutMs
}) {
  let child;
  try {
    child = spawnProcess('docker', args, { stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true });
  } catch {
    throw new SandboxError('docker_unavailable', 'Could not start Docker');
  }

  child.stdin?.on('error', () => fail('write_failed', 'Could not write to the sandbox runner'));
  let state = 'starting';
  let readyDone = false;
  let readyResolve;
  let readyReject;
  let processClosedResolve;
  const processClosed = new Promise((resolve) => { processClosedResolve = resolve; });
  const readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let pending = null;
  let sequence = 0;
  let latestSnapshot = null;
  let stdoutBuffer = '';
  let stderrBuffer = '';
  let stageTimer;
  let readyTimer;
  let closePromise;
  let removalPromise;
  let deadError = null;
  let secretsInSandbox = 0;
  let commandChain = Promise.resolve();

  const settleReady = (error) => {
    if (readyDone) return;
    readyDone = true;
    clearTimeout(readyTimer);
    if (error) readyReject(error); else readyResolve();
  };

  function removeContainer() {
    if (removalPromise) return removalPromise;
    removalPromise = (async () => {
      try { await captureDocker(spawnProcess, ['kill', name], 3000); } catch { /* exited or unavailable */ }
      try { await captureDocker(spawnProcess, ['rm', '-f', name], 3000); } catch { /* --rm may already have removed it */ }
    })();
    return removalPromise;
  }

  function fail(code, message) {
    if (state === 'failed' || state === 'closed') return deadError;
    state = 'failed';
    deadError = new SandboxError(code, message);
    clearTimeout(stageTimer);
    settleReady(deadError);
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(deadError);
      pending = null;
    }
    void removeContainer();
    try { onFailure?.(deadError); } catch { /* cleanup callbacks cannot interrupt failure handling */ }
    return deadError;
  }

  const handleStdoutLine = (line) => {
    let message;
    try { message = JSON.parse(line); }
    catch { fail('protocol_error', 'Sandbox runner returned invalid JSON'); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      fail('protocol_error', 'Sandbox runner returned an invalid protocol message');
      return;
    }
    if (message.ready === true && state === 'starting') {
      state = 'ready';
      settleReady();
      return;
    }
    if (message.fatal) {
      fail('runner_fatal', redactRunnerText(message.fatal, proxyToken, config.llm.apiKey, config.internalToken));
      return;
    }
    if (!pending || message.id !== pending.id || typeof message.ok !== 'boolean') {
      fail('protocol_error', 'Sandbox runner response did not match the pending command');
      return;
    }
    const secretCount = message.result?.envSecretsCount ?? message.envSecretsCount;
    if (Number.isInteger(secretCount) && secretCount > 0) {
      secretsInSandbox = secretCount;
      fail('secrets_detected', 'Sandbox reported secret-like environment variables; the container was stopped');
      return;
    }
    const current = pending;
    pending = null;
    clearTimeout(current.timer);
    if (!message.ok) current.reject(new SandboxError('runner_error', redactRunnerText(message.error || 'Sandbox command failed', proxyToken, config.llm.apiKey, config.internalToken)));
    else if (!Object.hasOwn(message, 'result')) current.reject(new SandboxError('protocol_error', 'Sandbox runner omitted the command result'));
    else current.resolve(message.result);
  };

  child.stdout?.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    if (stdoutBuffer.length > MAX_STDOUT_LINE && !stdoutBuffer.includes('\n')) {
      fail('protocol_error', 'Sandbox runner response exceeded the size limit');
      stdoutBuffer = '';
      return;
    }
    let newline;
    while ((newline = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line) { fail('protocol_error', 'Sandbox runner returned an empty protocol line'); return; }
      handleStdoutLine(line);
      if (state === 'failed') return;
    }
  });

  child.stderr?.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
    if (stderrBuffer.length > MAX_STDERR_LINE && !stderrBuffer.includes('\n')) stderrBuffer = stderrBuffer.slice(-MAX_STDERR_LINE);
    let newline;
    while ((newline = stderrBuffer.indexOf('\n')) >= 0) {
      const line = stderrBuffer.slice(0, newline).trim();
      stderrBuffer = stderrBuffer.slice(newline + 1);
      if (!line.startsWith('{') || line.length > MAX_STDERR_LINE) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (!event || typeof event.type !== 'string') continue;
      const normalized = safeEvent(event.type, event, proxyToken);
      if (!normalized) continue;
      try { onEvent?.(normalized.type, normalized.data, normalized.message); } catch { /* event consumers are isolated from the driver */ }
    }
  });

  child.on('error', () => {
    const error = fail('docker_unavailable', 'Could not start Docker');
    processClosedResolve();
    return error;
  });
  child.on('close', (code) => {
    clearTimeout(stageTimer);
    processClosedResolve();
    if (state === 'closing') { state = 'closed'; return; }
    if (state === 'failed' || state === 'closed') return;
    if (code === 137) fail('resource_limit', `The ${stage} sandbox reached a resource limit`);
    else if (state === 'starting') fail('docker_start_failed', `The ${stage} sandbox did not start (Docker exit ${code ?? 'unknown'})`);
    else fail('runner_closed', `The ${stage} sandbox exited unexpectedly (Docker exit ${code ?? 'unknown'})`);
  });

  stageTimer = setTimeout(() => fail('stage_timeout', `The ${stage} sandbox exceeded its time limit`), limits.stageTimeoutMs);
  readyTimer = setTimeout(() => fail('ready_timeout', 'Sandbox runner did not become ready in time'), readyTimeoutMs);

  function sendOne(payload) {
    if (state !== 'ready') return Promise.reject(deadError || new SandboxError('closed', 'Sandbox is not ready'));
    const id = ++sequence;
    const timeoutMs = Math.min(commandTimeouts[payload.cmd] || commandTimeout(payload.cmd, limits), Math.max(1, limits.deadline - Date.now()));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail('command_timeout', `Sandbox ${payload.cmd} command timed out`), timeoutMs);
      pending = { id, timer, resolve, reject };
      try {
        child.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
      } catch {
        fail('write_failed', 'Could not write to the sandbox runner');
      }
    });
  }

  function enqueue(payload) {
    const next = commandChain.then(() => sendOne(payload));
    commandChain = next.catch(() => {});
    return next;
  }

  function blocked(reason, target) {
    const safeTarget = String(target || 'browser action').slice(0, 2000);
    const message = `BLOCKED (ai): ${reason}`;
    try { onEvent?.('blocked', { layer: 'ai', target: safeTarget, reason }, message); } catch { /* ignore */ }
    throw new SandboxError('action_blocked', reason);
  }

  function normalizeCommand(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command) || !COMMANDS.has(command.cmd)) {
      throw new SandboxError('invalid_command', 'Unsupported sandbox command');
    }
    switch (command.cmd) {
      case 'discover':
        if (!isInScope(command.startUrl, scopeHosts)) blocked('Discovery URL is outside the site under test', command.startUrl);
        return { cmd: 'discover', startUrl: command.startUrl };
      case 'open':
        if (!isInScope(command.url, scopeHosts)) blocked('Navigation is outside the site under test', command.url);
        return { cmd: 'open', url: command.url };
      case 'snapshot':
        return { cmd: 'snapshot' };
      case 'audit':
        if (command.url != null && !isInScope(command.url, scopeHosts)) blocked('Audit URL is outside the site under test', command.url);
        return { cmd: 'audit', ...(command.url ? { url: command.url } : {}) };
      case 'act': {
        const verdict = checkAction(command.action, latestSnapshot, { scopeHosts, mode, hasLogin: false, loginUsed: false });
        if (!verdict.ok) blocked(verdict.reason, command.action?.url || command.action?.n || command.action?.action);
        if (verdict.action.action === 'done') throw new SandboxError('invalid_command', 'Journey completion is not a browser command');
        return { cmd: 'act', action: verdict.action };
      }
      default:
        throw new SandboxError('invalid_command', 'Unsupported sandbox command');
    }
  }

  async function act(command) {
    const payload = normalizeCommand(command);
    const result = await enqueue(payload);
    if (payload.cmd === 'snapshot') latestSnapshot = result;
    else latestSnapshot = null;
    return result;
  }

  async function close() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      if (state === 'ready') {
        try {
          await enqueue({ cmd: 'close' });
          state = 'closing';
          clearTimeout(stageTimer);
          child.stdin.end();
        } catch { /* failure cleanup below kills the container */ }
      }
      if (state !== 'closed' && state !== 'failed') {
        await Promise.race([processClosed, new Promise((resolve) => setTimeout(resolve, closeTimeoutMs))]);
      }
      if (state !== 'closed') await removeContainer();
      clearTimeout(stageTimer);
      state = state === 'failed' ? 'failed' : 'closed';
    })();
    return closePromise;
  }

  try { child.stdin.write(`${JSON.stringify(initLine)}\n`); }
  catch { fail('write_failed', 'Could not initialize the sandbox runner'); }

  return {
    ready: () => readyPromise,
    act,
    close,
    get secretsInSandbox() { return secretsInSandbox; },
    get runtime() { return args.includes('runsc') ? 'runsc' : 'runc'; }
  };
}

// Starts one command-server container for a single pipeline stage.
// The image gets no -e values, mounts, Docker socket, or API credentials.
export async function startSandbox({
  jobId,
  stage,
  init = {},
  onEvent,
  stageTimeoutMs,
  spawnProcess = spawn,
  sandboxConfig = config.sandbox,
  limitsConfig = config.limits,
  proxyClient = { registerJob, unregisterJob },
  commandTimeouts = {},
  readyTimeoutMs = 15000,
  closeTimeoutMs = 2000
} = {}) {
  validateName(jobId, /^[a-z0-9-]{8,80}$/i, 'Job ID');
  if (!STAGES.has(stage)) throw new SandboxError('invalid_stage', 'Sandbox stage is invalid');
  const network = validateName(sandboxConfig.network, /^[a-z0-9][a-z0-9_.-]{0,62}$/i, 'Docker network');
  const image = validateName(sandboxConfig.image, /^[a-z0-9][a-z0-9._:/-]{0,180}$/i, 'Sandbox image');
  if (!['runc', 'runsc'].includes(sandboxConfig.runtime)) throw new SandboxError('invalid_runtime', 'SANDBOX_RUNTIME must be runc or runsc');
  const hosts = normalizeHosts(init.scope?.hosts);
  const proxyServer = validateProxyServer(sandboxConfig.proxyUrl);
  // The documented backend pipeline may register one job token and reuse it
  // across stage containers. Without one, this driver owns a stage-scoped token.
  const suppliedProxyToken = validateRegisteredProxy(init.proxy, proxyServer);
  const boundedStageTimeout = integer(stageTimeoutMs, limitsConfig[`${stage}TimeoutMs`] || limitsConfig.exploreTimeoutMs);
  const now = Date.now();
  const deadline = Math.min(integer(init.deadline, now + boundedStageTimeout), now + boundedStageTimeout);
  const limits = {
    pageTimeoutMs: Math.min(integer(init.limits?.pageTimeoutMs, limitsConfig.pageTimeoutMs), limitsConfig.pageTimeoutMs),
    actionTimeoutMs: Math.min(integer(init.limits?.actionTimeoutMs, limitsConfig.actionTimeoutMs), limitsConfig.actionTimeoutMs),
    maxLinksPerPage: Math.min(integer(init.limits?.maxLinksPerPage, limitsConfig.maxLinksPerPage), limitsConfig.maxLinksPerPage),
    maxCandidates: Math.min(integer(init.limits?.maxCandidates, limitsConfig.maxCandidates), limitsConfig.maxCandidates),
    discoverTimeoutMs: limitsConfig.discoverTimeoutMs,
    auditCommandTimeoutMs: limitsConfig.pageTimeoutMs * 2 + 60000,
    stageTimeoutMs: Math.max(1, deadline - now),
    deadline
  };
  const name = `shipcheck-job-${jobId.slice(0, 8)}-${stage}-${randomBytes(3).toString('hex')}`;
  const proxyToken = suppliedProxyToken || randomBytes(32).toString('hex');
  const ownsProxyRegistration = !suppliedProxyToken;
  let registered = false;
  let unregisterPromise;
  const unregister = () => {
    if (!registered) return Promise.resolve({});
    if (!unregisterPromise) {
      unregisterPromise = Promise.resolve().then(() => proxyClient.unregisterJob(proxyToken))
        .then((counts) => { registered = false; return counts; })
        .catch(() => {
          try { onEvent?.('warning', { message: 'Could not unregister the sandbox egress proxy job' }, 'Could not unregister the sandbox egress proxy job'); } catch { /* ignore */ }
          return {};
        });
    }
    return unregisterPromise;
  };

  let runner;
  try {
    await inspectInternalNetwork(spawnProcess, network);
    if (ownsProxyRegistration) {
      await proxyClient.registerJob({ token: proxyToken, jobId, allowDomains: hosts });
      registered = true;
    }
    const initLine = makeInit({
      jobId,
      stage,
      init,
      hosts,
      proxyServer,
      proxyToken,
      limits: {
        pageTimeoutMs: limits.pageTimeoutMs,
        actionTimeoutMs: limits.actionTimeoutMs,
        maxLinksPerPage: limits.maxLinksPerPage,
        maxCandidates: limits.maxCandidates
      },
      deadline
    });
    const args = [
      'run', '--rm', '-i', '--name', name,
      '--network', network,
      '--memory', sandboxConfig.memory,
      '--memory-swap', sandboxConfig.memorySwap,
      '--cpus', sandboxConfig.cpus,
      '--pids-limit', String(sandboxConfig.pidsLimit),
      '--read-only', '--tmpfs', `/tmp:rw,size=${sandboxConfig.tmpfs}`,
      '--shm-size', sandboxConfig.shmSize,
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      ...(sandboxConfig.runtime === 'runsc' ? ['--runtime', 'runsc'] : []),
      image
    ];
    runner = createRunnerProcess({
      spawnProcess,
      args,
      initLine,
      name,
      stage,
      limits,
      scopeHosts: hosts,
      mode: initLine.mode,
      proxyToken,
      onEvent,
      onFailure: () => { void unregister(); },
      commandTimeouts,
      readyTimeoutMs,
      closeTimeoutMs
    });
    await runner.ready();
  } catch (error) {
    await runner?.close().catch(() => {});
    await unregister();
    if (error instanceof SandboxError) throw error;
    throw new SandboxError('sandbox_start_failed', 'Could not start the sandbox stage');
  }

  const runnerClose = runner.close.bind(runner);
  runner.close = async () => {
    const result = await runnerClose();
    await unregister();
    return result;
  };
  return runner;
}

export async function dockerCheck(args = ['info'], { spawnProcess = spawn, timeoutMs = 5000 } = {}) {
  try { await captureDocker(spawnProcess, args, timeoutMs); return true; }
  catch { return false; }
}
