import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, llmJson, LlmError } from '../src/llm/json.js';
import { PLAN_SYSTEM, DECIDE_ACTION_SYSTEM, ANALYZE_SYSTEM, SUMMARY_SYSTEM } from '../src/llm/prompts.js';

const schema = { safeParse: (value) => value?.ok === true ? { success: true, data: value } : { success: false, error: { issues: [{ path: ['ok'], message: 'Expected true' }] } } };

test('extractJson strips model reasoning and parses the first through last braces', () => {
  assert.deepEqual(extractJson('<think>internal</think> answer: {"ok":true} trailing'), { ok: true });
  assert.equal(extractJson('plain text'), null);
  assert.equal(extractJson('{bad json}'), null);
  assert.deepEqual(extractJson('{}'), {});
});

test('llmJson retries malformed or schema-invalid output once', async () => {
  const prompts = [];
  const result = await llmJson({ system: 'system', user: 'input', schema, request: async ({ messages }) => { prompts.push(messages); return prompts.length === 1 ? '{"ok":false}' : '```json\n{"ok":true}\n```'; } });
  assert.deepEqual(result, { ok: true });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1].at(-1).content, /not valid/);
});

test('llmJson fails clearly after the single corrective retry', async () => {
  let calls = 0;
  await assert.rejects(llmJson({ system: 'system', user: 'input', schema, request: async () => { calls += 1; return 'no object'; } }), (error) => error instanceof LlmError && /after one retry/.test(error.message));
  assert.equal(calls, 2);
});

test('network/API failures are reported as LlmError without retrying schema correction', async () => {
  let calls = 0;
  await assert.rejects(llmJson({ system: 'system', user: 'input', schema, request: async () => { calls += 1; throw new Error('service unavailable'); } }), (error) => error instanceof LlmError && /service unavailable/.test(error.message));
  assert.equal(calls, 1);
});

test('llmJson times out a hung provider request, aborts it, and does not retry', async () => {
  let calls = 0;
  let signal;
  await assert.rejects(llmJson({
    system: 'system', user: 'input', schema, timeoutMs: 15,
    request: ({ signal: requestSignal }) => {
      calls += 1;
      signal = requestSignal;
      return new Promise(() => {});
    }
  }), (error) => error instanceof LlmError && error.code === 'timeout' && /timed out/.test(error.message));
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
});

test('all four prompts mark page content untrusted and constrain actions to Core', () => {
  assert.match(PLAN_SYSTEM(), /ONLY choose URLs from the list/);
  assert.match(DECIDE_ACTION_SYSTEM(), /UNTRUSTED/);
  assert.match(DECIDE_ACTION_SYSTEM(), /Core actions/);
  assert.doesNotMatch(DECIDE_ACTION_SYSTEM(), /"action":"login"/);
  assert.match(ANALYZE_SYSTEM(), /<untrusted_page_text>/);
  assert.match(SUMMARY_SYSTEM, /Do not invent issues/);
});
