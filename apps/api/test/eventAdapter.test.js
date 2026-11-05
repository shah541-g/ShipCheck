import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAgentEventAdapter } from '../src/agent/eventAdapter.js';

const job = { id: 'job-1', status: 'exploring' };

function captureAdapter() {
  const calls = [];
  const emit = createAgentEventAdapter({
    job,
    addEvent: (receivedJob, event) => {
      calls.push({ receivedJob, event });
      return event;
    }
  });
  return { calls, emit };
}

test('adapts flat planner and runner progress to the canonical store event', () => {
  const { calls, emit } = captureAdapter();

  emit('progress', { message: 'Found 3 pages', url: 'https://example.com/' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].receivedJob, job);
  assert.deepEqual(calls[0].event, {
    type: 'progress', message: 'Found 3 pages', data: { url: 'https://example.com/' }
  });
});

test('flattens analyzer progress envelope without nesting Event.data.data', () => {
  const { calls, emit } = captureAdapter();

  emit('progress', { message: 'AI is reviewing the page', data: { url: 'https://example.com/pricing' } });

  assert.deepEqual(calls[0].event, {
    type: 'progress', message: 'AI is reviewing the page', data: { url: 'https://example.com/pricing' }
  });
});

test('preserves agent-step message, verdict, reason, and screenshot URL', () => {
  const { calls, emit } = captureAdapter();
  const payload = {
    journey: 'Start free trial', step: 2, action: 'click', targetName: 'Start free trial',
    verdict: 'allowed', reason: 'Open the signup flow', screenshotUrl: '/api/files/job-1/1.jpg',
    screenshotB64: 'must-not-enter-public-event', internalDebug: true
  };

  emit('agent_step', payload, 'Journey \'Start free trial\' · step 2: click "Start free trial" → ALLOWED');

  assert.deepEqual(calls[0].event, {
    type: 'agent_step',
    message: 'Journey \'Start free trial\' · step 2: click "Start free trial" → ALLOWED',
    data: {
      journey: payload.journey, step: payload.step, action: payload.action,
      targetName: payload.targetName, verdict: payload.verdict, reason: payload.reason,
      screenshotUrl: payload.screenshotUrl
    }
  });
  assert.equal(JSON.stringify(calls[0].event).includes('must-not-enter-public-event'), false);
});

test('preserves the complete agent-step contract when screenshot upload is unavailable', () => {
  const { calls, emit } = captureAdapter();
  const expectedData = {
    journey: 'Start free trial', step: 3, action: 'click', targetName: 'Start free trial',
    reason: 'Open the signup flow', verdict: 'allowed', screenshotUrl: null
  };

  emit('agent_step', expectedData, 'Clicking Start free trial → ALLOWED');

  assert.deepEqual(calls[0].event.data, expectedData);
  assert.deepEqual(Object.keys(calls[0].event.data).sort(), [
    'action', 'journey', 'reason', 'screenshotUrl', 'step', 'targetName', 'verdict'
  ]);
});

test('accepts stored screenshot locations but rejects screenshot bytes in screenshotUrl', () => {
  const { calls, emit } = captureAdapter();
  const base = {
    journey: 'Start free trial', step: 1, action: 'click', targetName: 'Start free trial',
    reason: 'Open the signup flow', verdict: 'allowed'
  };

  emit('agent_step', { ...base, screenshotUrl: 'https://storage.example/shots/job-1/1.jpg' });
  emit('agent_step', { ...base, screenshotUrl: '/api/files/job-1/2.jpg' });
  emit('agent_step', { ...base, screenshotUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==' });
  emit('agent_step', { ...base, screenshotUrl: '/9j/4AAQSkZJRgABAQ==' });

  assert.equal(calls[0].event.data.screenshotUrl, 'https://storage.example/shots/job-1/1.jpg');
  assert.equal(calls[1].event.data.screenshotUrl, '/api/files/job-1/2.jpg');
  assert.equal('screenshotUrl' in calls[2].event.data, false);
  assert.equal('screenshotUrl' in calls[3].event.data, false);
  assert.equal(JSON.stringify(calls).includes('4AAQSkZJRgABAQ=='), false);
});

test('creates the documented blocked message and keeps the block layer in data', () => {
  const { calls, emit } = captureAdapter();

  emit('blocked', { layer: 'ai', target: 'button 4', reason: 'Dangerous action blocked' });

  assert.deepEqual(calls[0].event, {
    type: 'blocked',
    message: 'BLOCKED (ai): button 4: Dangerous action blocked',
    data: { layer: 'ai', target: 'button 4', reason: 'Dangerous action blocked' }
  });
});

test('omits empty data and rejects event names outside the public contract', () => {
  const { calls, emit } = captureAdapter();

  emit('warning', { message: 'AI planning unavailable' });
  assert.deepEqual(calls[0].event, { type: 'warning', message: 'AI planning unavailable' });
  assert.throws(() => emit('sandbox_debug', { message: 'not a public event' }), /Unsupported ShipCheck event type/);
});

test('drops journey-event fields that are not in the shared event contract', () => {
  const { calls, emit } = captureAdapter();

  emit('journey', { title: 'Start free trial', status: 'failed', reason: 'The last page returned 404' });

  assert.deepEqual(calls[0].event, {
    type: 'journey', message: 'Journey Start free trial: failed',
    data: { title: 'Start free trial', status: 'failed' }
  });
});

test('retains each other event type’s documented fields', () => {
  const { calls, emit } = captureAdapter();

  emit('stage', { stage: 'planning', ignored: 'private' });
  emit('finding', { severity: 'high', checkId: 'journey.failed', id: 'internal-finding-id' });
  emit('error', { code: 'discover_failed', stack: 'internal stack' });
  emit('done', { score: 82, grade: 'B', model: 'internal model metadata' });

  assert.deepEqual(calls.map(({ event }) => event.data), [
    { stage: 'planning' },
    { severity: 'high', checkId: 'journey.failed' },
    { code: 'discover_failed' },
    { score: 82, grade: 'B' }
  ]);
});

test('redacts job and injected secrets from allowed fields and messages', () => {
  const password = 'user-passphrase-never-log';
  const proxyToken = 'proxy-token-never-log';
  const events = [];
  const emit = createAgentEventAdapter({
    job: { ...job, _login: { username: 'user-name-never-log', password } },
    secrets: [proxyToken],
    addEvent: (_job, event) => { events.push(event); return event; }
  });
  const secretText = `Reason includes ${password} and ${proxyToken} for user-name-never-log`;

  emit('agent_step', {
    journey: 'Start free trial', step: 1, action: 'click', targetName: 'Start free trial',
    verdict: 'allowed', reason: secretText, screenshotUrl: null,
    password, apiKey: 'unsupported-key', proxyToken, internalToken: 'unsupported-internal-token',
    screenshotB64: 'unsupported-image', internalDebug: true
  }, secretText);

  const serialized = JSON.stringify(events[0]);
  assert.equal(serialized.includes(password), false);
  assert.equal(serialized.includes(proxyToken), false);
  assert.equal(serialized.includes('user-name-never-log'), false);
  assert.equal(serialized.includes('unsupported-key'), false);
  assert.equal(serialized.includes('unsupported-internal-token'), false);
  assert.equal(serialized.includes('unsupported-image'), false);
  assert.equal(events[0].data.reason.includes('[redacted]'), true);
});

test('omits malformed field values rather than serializing unsupported shapes', () => {
  const { calls, emit } = captureAdapter();

  emit('agent_step', {
    journey: 'Start free trial', step: '3', action: 'click', targetName: { text: 'button' },
    reason: 'Open the signup flow', verdict: 'allowed', screenshotUrl: { bytes: 'hidden' }
  });

  assert.deepEqual(calls[0].event.data, {
    journey: 'Start free trial', action: 'click', reason: 'Open the signup flow', verdict: 'allowed'
  });
});
