import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCoreAction, parseJsonObject, runSmoke } from '../scripts/llm-smoke.js';

test('smoke parser strips think sections and extracts a JSON object', () => {
  assert.deepEqual(parseJsonObject('<think>reasoning</think> result: {"ok":true}'), { ok: true });
  assert.equal(parseJsonObject('not JSON'), null);
  assert.equal(parseJsonObject('[1,2]'), null);
});

test('Core action check accepts only the contracted action shapes', () => {
  assert.equal(isCoreAction({ action: 'click', n: 2, reason: 'Open pricing' }), true);
  assert.equal(isCoreAction({ action: 'type', n: 2, text: 'test@example.com', reason: 'Try form' }), true);
  assert.equal(isCoreAction({ action: 'click', n: 0, reason: 'Bad index' }), false);
  assert.equal(isCoreAction({ action: 'click', n: 2, reason: 'Open', script: 'alert(1)' }), false);
  assert.equal(isCoreAction({ action: 'login', reason: 'Log in' }), false);
});

test('smoke exercise lists models and tests both JSON modes and a valid action', async () => {
  const calls = [];
  const replies = ['{"ok":true,"pages":["https://example.com/"]}', '{"ok":true,"pages":["https://example.com/"]}', '{"action":"click","n":2,"reason":"Open pricing"}'];
  const client = {
    models: { list: async () => ({ data: [{ id: 'model-a' }, { id: 'model-b' }] }) },
    chat: { completions: { create: async (args) => { calls.push(args); return { choices: [{ message: { content: replies.shift() } }] }; } } }
  };
  const logs = [];
  const result = await runSmoke({ client, model: 'model-a', log: (...args) => logs.push(args.join(' ')) });
  assert.deepEqual(result.models, ['model-a', 'model-b']);
  assert.equal(result.json['json_mode=true'].valid, true);
  assert.equal(result.json['json_mode=false'].valid, true);
  assert.deepEqual(result.action, { action: 'click', n: 2, reason: 'Open pricing' });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].response_format.type, 'json_object');
  assert.equal('response_format' in calls[1], false);
  assert.match(calls[2].messages[0].content, /Use n for the snapshot element number, never element or target/);
  assert.ok(logs.some((line) => line.includes('action test:')));
  assert.deepEqual(result.errors, []);
});

test('provider error messages redact the configured API key', async () => {
  const apiKey = 'do-not-log-this-key';
  const logs = [];
  const client = {
    models: { list: async () => { throw new Error(`unauthorized ${apiKey}`); } },
    chat: { completions: { create: async () => { throw new Error(`unauthorized ${apiKey}`); } } }
  };
  const result = await runSmoke({ client, model: 'gemini-test', apiKey, log: (...args) => logs.push(args.join(' ')) });
  assert.ok(result.errors.length > 0);
  assert.equal(JSON.stringify(result).includes(apiKey), false);
  assert.equal(logs.join('\n').includes(apiKey), false);
});

test('smoke test does not suggest choosing a model when listing failed', async () => {
  const logs = [];
  const client = { models: { list: async () => { throw new Error('provider unavailable'); } } };
  const result = await runSmoke({ client, model: '', log: (...args) => logs.push(args.join(' ')) });
  assert.ok(result.errors.some((error) => /Model list failed/.test(error)));
  assert.match(logs.at(-1), /Fix provider access/);
  assert.doesNotMatch(logs.at(-1), /Set LLM_MODEL/);
});
