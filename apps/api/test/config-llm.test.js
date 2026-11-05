import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLlmConfig } from '../src/config.js';

test('Gemini provider selects its OpenAI-compatible default endpoint', () => {
  const llm = resolveLlmConfig({ LLM_PROVIDER: 'Gemini', LLM_API_KEY: 'test-key', LLM_MODEL: 'test-model' });
  assert.equal(llm.provider, 'gemini');
  assert.equal(llm.baseURL, 'https://generativelanguage.googleapis.com/v1beta/openai/');
  assert.equal(llm.apiKey, 'test-key');
  assert.equal(llm.model, 'test-model');
});

test('Vultr is the default provider, and other endpoints stay selectable', () => {
  // The hackathon requires that the AI calls go to Vultr Serverless Inference, so an
  // environment that names no provider must not fall back to anything else.
  const fallback = resolveLlmConfig({});
  assert.equal(fallback.provider, 'vultr');
  assert.equal(fallback.baseURL, 'https://api.vultrinference.com/v1');

  const vultr = resolveLlmConfig({ LLM_PROVIDER: 'vultr' });
  assert.equal(vultr.provider, 'vultr');
  assert.equal(vultr.baseURL, 'https://api.vultrinference.com/v1');

  const custom = resolveLlmConfig({
    LLM_PROVIDER: 'gemini',
    LLM_BASE_URL: 'https://llm.example.test/v1/',
    LLM_API_KEY: 'configured-key',
    LLM_MODEL: 'configured-model',
    LLM_JSON_MODE: 'false'
  });
  assert.equal(custom.provider, 'gemini');
  assert.equal(custom.baseURL, 'https://llm.example.test/v1/');
  assert.equal(custom.apiKey, 'configured-key');
  assert.equal(custom.model, 'configured-model');
  assert.equal(custom.jsonMode, false);
});
