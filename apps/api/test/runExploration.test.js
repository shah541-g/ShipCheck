import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentEventAdapter } from '../src/agent/eventAdapter.js';
import { runExploration } from '../src/agent/runExploration.js';

test('connects the existing explorer to a stage driver and always closes it', async () => {
  const calls = [];
  let closed = false;
  let started;
  const home = 'https://demo.example/';
  const sandbox = {
    async act(command) {
      calls.push(command);
      if (command.cmd === 'open') return { url: command.url, status: 200, newErrors: [] };
      if (command.cmd === 'audit') return { url: command.url, status: 200, findings: [] };
      throw new Error(`Unexpected command ${command.cmd}`);
    },
    async close() { closed = true; }
  };
  const result = await runExploration({ id: '12345678-abcd', target: { url: home } }, {
    plan: { pages: [], journeys: [] },
    scope: { hosts: ['demo.example', 'www.demo.example'] },
    startSandboxFn: async (options) => { started = options; return sandbox; }
  });

  assert.equal(started.jobId, '12345678-abcd');
  assert.equal(started.stage, 'explore');
  assert.deepEqual(started.init.scope.hosts, ['demo.example', 'www.demo.example']);
  assert.equal(calls[0].cmd, 'open');
  assert.equal(calls[1].cmd, 'audit');
  assert.equal(result.pages.length, 1);
  assert.equal(closed, true);
});

test('reuses a pipeline-owned sandbox and forwards canonical events without duplicate startup or cleanup', async () => {
  const events = [];
  const job = { id: '12345678-abcd', target: { url: 'https://demo.example/' } };
  const emit = createAgentEventAdapter({
    job,
    addEvent: (_job, event) => { events.push(event); return event; }
  });
  let startCount = 0;
  let closeCount = 0;
  const sandbox = {
    async act(command) {
      if (command.cmd === 'open') return { url: command.url, status: 200, newErrors: [] };
      if (command.cmd === 'audit') return { url: command.url, status: 200, findings: [], screenshot: 'private-base64' };
      if (command.cmd === 'snapshot') return { url: job.target.url, title: 'Home', elements: [], textExcerpt: 'Welcome' };
      throw new Error(`Unexpected command ${command.cmd}`);
    },
    async close() { closeCount += 1; }
  };

  await runExploration(job, {
    sandbox,
    plan: {
      pages: [{ url: job.target.url, reason: 'Start page' }],
      journeys: [{ id: 'j1', title: 'Check home', goal: 'Confirm the home page is available.' }]
    },
    scope: { hosts: ['demo.example'] },
    emit,
    decide: async () => ({ action: 'done', status: 'passed', reason: 'The home page is available.' }),
    startSandboxFn: async () => { startCount += 1; throw new Error('must reuse pipeline sandbox'); }
  });

  assert.equal(startCount, 0);
  assert.equal(closeCount, 0, 'the pipeline retains ownership of its sandbox lifecycle');
  assert.ok(events.some((event) => event.type === 'progress' && event.data.url === job.target.url));
  const stepEvent = events.find((event) => event.type === 'agent_step');
  assert.deepEqual(stepEvent.data, {
    journey: 'Check home', step: 1, action: 'done', targetName: '',
    verdict: 'allowed', reason: 'The home page is available.', screenshotUrl: null
  });
  assert.equal(JSON.stringify(events).includes('private-base64'), false);
});
