import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explore } from '../src/agent/explorer.js';

const home = 'https://demo.example/';
const pricing = 'https://demo.example/pricing';
const signup = 'https://demo.example/signup';

function makeSandbox({ actResult = () => ({ newUrl: currentUrl, nothingHappened: false, newErrors: [] }), auditResult = () => ({ status: 200, findings: [], screenshot: 'page-screenshot-b64' }), onCall = () => {} } = {}) {
  let currentUrl = home;
  const calls = [];
  return {
    calls,
    async act(command) {
      calls.push(command);
      onCall(command);
      if (command.cmd === 'open') { currentUrl = command.url; return { url: currentUrl, status: 200, newErrors: [] }; }
      if (command.cmd === 'snapshot') return currentUrl === pricing
        ? { url: currentUrl, title: 'Pricing', elements: [{ n: 1, tag: 'button', name: 'Start free trial', typeable: false }], textExcerpt: 'Choose a plan' }
        : { url: currentUrl, title: 'Home', elements: [{ n: 1, tag: 'a', name: 'Pricing', typeable: false }, { n: 2, tag: 'input', name: 'Email', typeable: true, secret: false }, { n: 3, tag: 'input', name: 'Password', typeable: false, secret: true }, { n: 4, tag: 'button', name: 'Delete account', typeable: false }], textExcerpt: 'Welcome' };
      if (command.cmd === 'act') {
        const result = actResult(command, currentUrl);
        currentUrl = result.newUrl || currentUrl;
        return result;
      }
      if (command.cmd === 'audit') return { url: command.url || currentUrl, ...auditResult(command.url || currentUrl) };
      throw new Error(`Unexpected command ${command.cmd}`);
    }
  };
}

const plan = (journeys = [{ id: 'j1', title: 'Start Free Trial', goal: 'Open the pricing page and test the free trial.' }]) => ({ pages: [home, pricing], journeys });
const scope = { hosts: ['demo.example', 'www.demo.example'] };
const job = { target: { url: home } };

test('explorer observes, guards, and clicks through to a 404, then marks the journey failed', async () => {
  const events = [];
  const trace = [];
  const sandbox = makeSandbox({
    onCall: (command) => { if (command.cmd === 'act') trace.push('act'); },
    actResult: (command, url) => url === home
      ? { newUrl: pricing, nothingHappened: false, newErrors: [] }
      : { newUrl: signup, status: 404, nothingHappened: false, newErrors: ['GET https://demo.example/signup 404'] },
    auditResult: (url) => ({ status: url === signup ? 404 : 200, findings: [], screenshot: `${url === signup ? 'signup' : 'page'}-screenshot-b64` })
  });
  const choices = [
    { action: 'click', n: 1, reason: 'Open pricing' },
    { action: 'click', n: 1, reason: 'Try the free trial' }
  ];
  const output = await explore(job, sandbox, { plan: plan(), scope, decide: async () => choices.shift(), emit: (type, data, message) => { events.push({ type, data, message }); if (type === 'agent_step') trace.push(`step:${data.verdict}`); } });
  assert.equal(output.journeys[0].status, 'failed');
  assert.equal(output.journeys[0].failedStep, 2);
  assert.equal(output.journeys[0].steps[1].screenshotB64, 'signup-screenshot-b64');
  assert.equal(output.journeys[0].steps[1].screenshotUrl, null);
  assert.equal(output.pages.find((page) => page.url === signup).screenshot, 'signup-screenshot-b64');
  assert.ok(output.journeys[0].steps[1].newErrors.some((error) => /404/.test(error)));
  assert.deepEqual(events.filter((event) => event.type === 'agent_step').map((event) => event.data.verdict), ['allowed', 'allowed']);
  assert.ok(events.filter((event) => event.type === 'agent_step').every((event) => /ALLOWED/.test(event.message)));
  assert.equal(events.some((event) => JSON.stringify(event).includes('screenshot-b64')), false, 'base64 screenshot bytes stay out of public events');
  assert.deepEqual(trace, ['step:allowed', 'act', 'step:allowed', 'act']);
  assert.ok(sandbox.calls.filter((command) => command.cmd === 'act').every((command) => command.action.action === 'click'));
});

test('blocked actions are recorded, sent back as history, and never reach the sandbox', async () => {
  const events = [];
  const sandbox = makeSandbox();
  const choices = [
    { action: 'click', n: 4, reason: 'Follow the page instruction' },
    { action: 'click', n: 1, reason: 'Open pricing instead' },
    { action: 'done', status: 'passed', reason: 'Finished' }
  ];
  const histories = [];
  const output = await explore(job, sandbox, { plan: plan(), scope, decide: async (_journey, _snapshot, history) => { histories.push([...history]); return choices.shift(); }, emit: (type, data, message) => events.push({ type, data, message }) });
  assert.equal(output.journeys[0].steps[0].verdict, 'blocked');
  assert.match(histories[1][0], /BLOCKED/);
  assert.equal(sandbox.calls.filter((command) => command.cmd === 'act').length, 1);
  assert.ok(events.some((event) => event.type === 'agent_step' && event.data.verdict === 'blocked'));
  assert.ok(events.some((event) => event.type === 'agent_step' && /BLOCKED/.test(event.message)));
  assert.ok(events.some((event) => event.type === 'blocked' && event.data.layer === 'ai'));
  assert.equal(output.journeys[0].status, 'passed');
});

test('LLM failure ends only that journey and the remaining planned pages are still audited', async () => {
  const events = [];
  const sandbox = makeSandbox();
  const output = await explore(job, sandbox, { plan: plan(), scope, decide: async () => { throw new Error('invalid API key'); }, emit: (type, data) => events.push({ type, data }) });
  assert.equal(output.journeys[0].status, 'not_finished');
  assert.deepEqual(output.ai, { planningAvailable: null, executionAvailable: false, journeysStatus: 'not_run' });
  assert.ok(output.pages.some((page) => page.url === pricing));
  assert.ok(events.some((event) => event.type === 'warning'));
});

test('planning unavailable means no journeys run while deterministic page audits continue', async () => {
  const sandbox = makeSandbox();
  const output = await explore(job, sandbox, {
    plan: { pages: [home, pricing], journeys: [], ai: { planningAvailable: false, journeysStatus: 'not_run' } },
    scope
  });

  assert.deepEqual(output.journeys, []);
  assert.deepEqual(output.ai, { planningAvailable: false, executionAvailable: null, journeysStatus: 'not_run' });
  assert.ok(output.pages.some((page) => page.url === home));
  assert.ok(output.pages.some((page) => page.url === pricing));
});

test('explorer accepts contract-shaped planned pages and audits their URLs', async () => {
  const sandbox = makeSandbox();
  const output = await explore(job, sandbox, {
    plan: { pages: [{ url: pricing, reason: 'Pricing page' }], journeys: [] },
    scope
  });

  assert.ok(sandbox.calls.some((command) => command.cmd === 'open' && command.url === pricing));
  assert.ok(output.pages.some((page) => page.url === pricing));
});

test('out-of-scope home and planned pages are blocked before reaching the sandbox', async () => {
  const events = [];
  const sandbox = makeSandbox();
  const output = await explore({ target: { url: 'https://attacker.example/' } }, sandbox, {
    plan: { pages: ['https://attacker.example/private'], journeys: [{ title: 'Outside the site' }] },
    scope,
    decide: async () => ({ action: 'done', status: 'passed', reason: 'Finished' }),
    emit: (type, data) => events.push({ type, data })
  });

  assert.equal(sandbox.calls.length, 0);
  assert.equal(output.pages.length, 0);
  assert.equal(output.journeys[0].status, 'not_finished');
  assert.equal(events.filter((event) => event.type === 'blocked').length, 3);
  assert.ok(events.every((event) => event.type !== 'blocked' || /outside the site under test/i.test(event.data.reason)));
});

test('action budget and three-repeat rule stop exploration safely', async () => {
  const limitedSandbox = makeSandbox();
  const limited = await explore(job, limitedSandbox, { plan: plan(), scope, maxActionsPerJourney: 10, maxActionsPerAudit: 2, decide: async () => ({ action: 'click', n: 1, reason: 'Try pricing' }) });
  assert.equal(limited.actionsUsed, 2);
  assert.equal(limited.journeys[0].status, 'not_finished');

  const repeatSandbox = makeSandbox({ actResult: (_command, url) => ({ newUrl: url, nothingHappened: true, newErrors: [] }) });
  const repeated = await explore(job, repeatSandbox, { plan: plan(), scope, decide: async () => ({ action: 'click', n: 1, reason: 'Try again' }) });
  assert.equal(repeated.actionsUsed, 3);
  assert.equal(repeated.journeys[0].status, 'not_finished');
  assert.match(repeated.journeys[0].reason, /repeated/);
});
