import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxError, startSandbox } from '../src/sandbox/runSandbox.js';

const home = 'https://demo.example/';
const hosts = ['demo.example', 'www.demo.example'];
const sandboxConfig = {
  image: 'shipcheck-sandbox:test', network: 'shipcheck-sandbox', runtime: 'runsc',
  proxyUrl: 'http://172.30.0.10:3128', memory: '1g', memorySwap: '1g', cpus: '1',
  pidsLimit: 1024, tmpfs: '512m', shmSize: '512m'
};
const limitsConfig = {
  pageTimeoutMs: 200, actionTimeoutMs: 100, maxLinksPerPage: 30, maxCandidates: 50,
  discoverTimeoutMs: 500, exploreTimeoutMs: 1000, verifyTimeoutMs: 500
};

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdin = new PassThrough();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
  }
  kill() { setImmediate(() => this.emit('close', 137)); }
}

function makeSpawn({ internal = true, behavior = 'ok' } = {}) {
  const calls = [];
  const initMessages = [];
  const runnerCommands = [];
  function spawnProcess(_binary, args) {
    calls.push([...args]);
    const child = new FakeChild();
    if (args[0] === 'network') {
      setImmediate(() => {
        child.stdout.end(`${internal ? 'true' : 'false'}\n`);
        child.emit('close', 0);
      });
      return child;
    }
    if (args[0] === 'kill' || args[0] === 'rm') {
      setImmediate(() => child.emit('close', 0));
      return child;
    }
    if (args[0] !== 'run') throw new Error('Unexpected Docker command');

    let input = '';
    child.stdin.on('data', (chunk) => {
      input += chunk.toString();
      let newline;
      while ((newline = input.indexOf('\n')) >= 0) {
        const line = input.slice(0, newline);
        input = input.slice(newline + 1);
        const message = JSON.parse(line);
        if (message.init) {
          initMessages.push(message);
          if (behavior !== 'no-ready') child.stdout.write('{"ready":true}\n');
          continue;
        }
        runnerCommands.push(message);
        if (behavior === 'stderr' && message.cmd === 'snapshot') {
          child.stderr.write('Chromium: non-JSON diagnostic\n');
          child.stderr.write(`${JSON.stringify({
            type: 'blocked', layer: 'browser', target: 'https://attacker.example/',
            reason: `blocked ${initMessages[0].proxy.username}`
          })}\n`);
          child.stderr.write('{"type":"invented_event","message":"ignore"}\n');
        }
        if (behavior === 'timeout' && message.cmd === 'snapshot') continue;
        if (behavior === 'mismatch') {
          child.stdout.write(`${JSON.stringify({ id: message.id + 1, ok: true, result: {} })}\n`);
          continue;
        }
        if (behavior === 'runner-error' && message.cmd === 'audit') {
          child.stdout.write(`${JSON.stringify({ id: message.id, ok: false, error: `failure ${initMessages[0].proxy.username}` })}\n`);
          continue;
        }
        if (behavior === 'secrets' && message.cmd === 'audit') {
          child.stdout.write(`${JSON.stringify({ id: message.id, ok: true, result: { envSecretsCount: 1 } })}\n`);
          continue;
        }
        if (message.cmd === 'close') {
          child.stdout.write(`${JSON.stringify({ id: message.id, ok: true, result: { ok: true } })}\n`);
          setImmediate(() => { child.stdin.end(); child.stdout.end(); child.emit('close', 0); });
          continue;
        }
        let result = {};
        if (message.cmd === 'open') result = { url: message.url, status: 200, newErrors: [] };
        if (message.cmd === 'snapshot') result = {
          url: home, title: 'Demo', textExcerpt: 'Welcome',
          elements: [
            { n: 1, tag: 'a', name: 'Pricing', typeable: false, secret: false },
            { n: 2, tag: 'button', name: 'Delete account', typeable: false, secret: false }
          ]
        };
        if (message.cmd === 'act') result = { newUrl: 'https://demo.example/pricing.html', nothingHappened: false, newErrors: [] };
        if (message.cmd === 'audit') result = { url: message.url || home, status: 200, findings: [], screenshot: 'base64', envSecretsCount: 0 };
        if (message.cmd === 'discover') result = { startUrl: message.startUrl, candidates: [], externalLinks: [], envSecretsCount: 0 };
        child.stdout.write(`${JSON.stringify({ id: message.id, ok: true, result })}\n`);
      }
    });
    return child;
  }
  return { spawnProcess, calls, initMessages, runnerCommands };
}

function proxyStub() {
  return {
    registered: [],
    unregistered: [],
    async registerJob(value) { this.registered.push(value); },
    async unregisterJob(token) { this.unregistered.push(token); return { blocked: 0 }; }
  };
}

function options(spawn, proxy = proxyStub(), extras = {}) {
  return {
    jobId: '12345678-aaaa-bbbb', stage: 'explore',
    init: { mode: 'safe', scope: { hosts } },
    sandboxConfig, limitsConfig, proxyClient: proxy,
    spawnProcess: spawn.spawnProcess,
    readyTimeoutMs: 100, closeTimeoutMs: 100,
    ...extras
  };
}

test('starts the documented runner protocol, unwraps results, and confines allowed actions to checkAction', async () => {
  const fake = makeSpawn();
  const proxy = proxyStub();
  const driver = await startSandbox(options(fake, proxy, { init: { mode: 'safe', scope: { hosts }, hostSecret: 'never-forward-this' } }));

  assert.equal(driver.runtime, 'runsc');
  assert.deepEqual(await driver.act({ cmd: 'open', url: home }), { url: home, status: 200, newErrors: [] });
  const snapshot = await driver.act({ cmd: 'snapshot' });
  assert.equal(snapshot.elements[0].name, 'Pricing');
  assert.deepEqual(await driver.act({ cmd: 'act', action: { action: 'click', n: 1, reason: 'Open pricing' } }), {
    newUrl: 'https://demo.example/pricing.html', nothingHappened: false, newErrors: []
  });
  await driver.close();

  const init = fake.initMessages[0];
  assert.equal(init.kind, 'explore');
  assert.deepEqual(init.scope.hosts, hosts);
  assert.equal('hostSecret' in init, false);
  assert.equal(JSON.stringify(init).includes('never-forward-this'), false);
  assert.deepEqual(proxy.registered[0].allowDomains, hosts);
  assert.deepEqual(proxy.unregistered, [init.proxy.username]);
  const runArgs = fake.calls.find((call) => call[0] === 'run');
  assert.ok(runArgs.includes('--runtime') && runArgs.includes('runsc'));
  assert.equal(runArgs.some((arg) => ['-e', '--env', '-v', '--volume'].includes(arg)), false);
  assert.equal(runArgs.some((arg) => arg.includes('docker.sock')), false);
  assert.deepEqual(fake.runnerCommands.map((message) => message.id), [1, 2, 3, 4]);
  assert.deepEqual(fake.runnerCommands.map((message) => message.cmd), ['open', 'snapshot', 'act', 'close']);
});

test('reuses a pre-registered job proxy token without registering or unregistering a stage token', async () => {
  const fake = makeSpawn();
  const proxy = proxyStub();
  const jobToken = 'a'.repeat(64);
  const driver = await startSandbox(options(fake, proxy, {
    init: { mode: 'safe', scope: { hosts }, proxy: { server: sandboxConfig.proxyUrl, username: jobToken, password: 'x' } }
  }));

  assert.equal(fake.initMessages[0].proxy.username, jobToken);
  assert.equal(proxy.registered.length, 0, 'the pipeline owns the job-level registration');
  await driver.close();
  assert.equal(proxy.unregistered.length, 0, 'the pipeline owns job-level cleanup and block-count collection');
});

test('rejects an invalid pre-registered proxy token before starting Docker', async () => {
  const fake = makeSpawn();
  const proxy = proxyStub();

  await assert.rejects(startSandbox(options(fake, proxy, {
    init: { mode: 'safe', scope: { hosts }, proxy: { server: sandboxConfig.proxyUrl, username: 'invalid', password: 'x' } }
  })), (error) => error instanceof SandboxError && error.code === 'invalid_config');
  assert.equal(fake.calls.length, 0);
  assert.equal(proxy.registered.length, 0);
});

test('blocks dangerous actions and off-scope navigation before writing commands to the runner', async () => {
  const fake = makeSpawn();
  const events = [];
  const driver = await startSandbox(options(fake, proxyStub(), { onEvent: (...event) => events.push(event) }));
  await driver.act({ cmd: 'snapshot' });

  await assert.rejects(driver.act({ cmd: 'act', action: { action: 'click', n: 2, reason: 'Delete' } }),
    (error) => error instanceof SandboxError && error.code === 'action_blocked');
  await assert.rejects(driver.act({ cmd: 'open', url: 'https://attacker.example/' }),
    (error) => error instanceof SandboxError && error.code === 'action_blocked');
  assert.deepEqual(fake.runnerCommands.map((message) => message.cmd), ['snapshot']);
  assert.equal(events.filter(([type]) => type === 'blocked').length, 2);
  await driver.close();
});

test('normalizes stderr security events, ignores Chromium text and redacts the job proxy token', async () => {
  const fake = makeSpawn({ behavior: 'stderr' });
  const events = [];
  const driver = await startSandbox(options(fake, proxyStub(), { onEvent: (...event) => events.push(event) }));
  await driver.act({ cmd: 'snapshot' });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], 'blocked');
  assert.equal(events[0][1].layer, 'browser');
  assert.match(events[0][1].reason, /\[redacted\]/);
  assert.equal(events[0][1].reason.includes(fake.initMessages[0].proxy.username), false);
  await driver.close();
});

test('fails closed before proxy registration or runner launch on a non-internal Docker network', async () => {
  const fake = makeSpawn({ internal: false });
  const proxy = proxyStub();
  await assert.rejects(startSandbox(options(fake, proxy)),
    (error) => error instanceof SandboxError && error.code === 'network_not_internal');
  assert.equal(proxy.registered.length, 0);
  assert.equal(fake.calls.some((call) => call[0] === 'run'), false);
});

test('turns runner command errors into redacted SandboxErrors and still cleans up', async () => {
  const fake = makeSpawn({ behavior: 'runner-error' });
  const proxy = proxyStub();
  const driver = await startSandbox(options(fake, proxy));
  await assert.rejects(driver.act({ cmd: 'audit', url: home }), (error) => {
    assert.equal(error.code, 'runner_error');
    assert.equal(error.message.includes(fake.initMessages[0].proxy.username), false);
    return true;
  });
  await driver.close();
  assert.deepEqual(proxy.unregistered, [fake.initMessages[0].proxy.username]);
});

test('command timeouts kill and remove the container and unregister its proxy job', async () => {
  const fake = makeSpawn({ behavior: 'timeout' });
  const proxy = proxyStub();
  const driver = await startSandbox(options(fake, proxy, { commandTimeouts: { snapshot: 20 } }));
  await assert.rejects(driver.act({ cmd: 'snapshot' }),
    (error) => error instanceof SandboxError && error.code === 'command_timeout');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(fake.calls.some((call) => call[0] === 'kill'));
  assert.ok(fake.calls.some((call) => call[0] === 'rm'));
  assert.equal(proxy.unregistered.length, 1);
  await driver.close();
});

test('rejects mismatched command IDs and stops the runner', async () => {
  const fake = makeSpawn({ behavior: 'mismatch' });
  const driver = await startSandbox(options(fake));
  await assert.rejects(driver.act({ cmd: 'snapshot' }),
    (error) => error instanceof SandboxError && error.code === 'protocol_error');
  await driver.close();
});

test('stops the container when the runner reports secret-like environment variables', async () => {
  const fake = makeSpawn({ behavior: 'secrets' });
  const driver = await startSandbox(options(fake));
  await assert.rejects(driver.act({ cmd: 'audit', url: home }),
    (error) => error instanceof SandboxError && error.code === 'secrets_detected');
  assert.equal(driver.secretsInSandbox, 1);
  await driver.close();
});

test('ready timeout cleans up the container and proxy registration', async () => {
  const fake = makeSpawn({ behavior: 'no-ready' });
  const proxy = proxyStub();
  await assert.rejects(startSandbox(options(fake, proxy, { readyTimeoutMs: 20 })),
    (error) => error instanceof SandboxError && error.code === 'ready_timeout');
  assert.ok(fake.calls.some((call) => call[0] === 'kill'));
  assert.equal(proxy.unregistered.length, 1);
});
