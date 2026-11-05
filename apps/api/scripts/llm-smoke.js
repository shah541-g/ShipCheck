// List models and test JSON replies plus one valid Core browser action.
// Run from apps/api: node --env-file=.env.development scripts/llm-smoke.js
import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';

const safeErrorMessage = (error, apiKey = config.llm.apiKey) => {
  let message = String(error?.message || error || 'Unknown inference error');
  if (apiKey) message = message.split(apiKey).join('[redacted]');
  return message.slice(0, 500);
};

export function parseJsonObject(text) {
  const cleaned = String(text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { const value = JSON.parse(cleaned.slice(start, end + 1)); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  catch { return null; }
}

export function isCoreAction(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.reason !== 'string' || !value.reason.trim()) return false;
  const keys = Object.keys(value).sort().join(',');
  if (value.action === 'goto') return keys === 'action,reason,url' && typeof value.url === 'string' && /^https?:\/\//.test(value.url);
  if (value.action === 'click') return keys === 'action,n,reason' && Number.isInteger(value.n) && value.n > 0;
  if (value.action === 'type') return keys === 'action,n,reason,text' && Number.isInteger(value.n) && value.n > 0 && typeof value.text === 'string' && value.text.length <= 200;
  if (value.action === 'done') return keys === 'action,reason,status' && ['passed', 'failed'].includes(value.status);
  return false;
}

async function listModels(client) {
  const models = await client.models.list();
  if (models?.[Symbol.asyncIterator]) {
    const items = [];
    for await (const model of models) items.push(model.id);
    return items;
  }
  return (models?.data || []).map((model) => model.id);
}

export async function runSmoke({ client, model, jsonMode = true, apiKey = config.llm.apiKey, log = () => {} }) {
  const result = { models: [], json: {}, action: null, errors: [] };
  try { result.models = await listModels(client); log('Models available:', result.models); }
  catch (error) { const message = safeErrorMessage(error, apiKey); result.errors.push(`Model list failed: ${message}`); log(`Model list failed: ${error.status || ''} ${message}`.trim()); }
  if (!model) {
    log(result.models.length
      ? 'Set LLM_MODEL to one of the listed IDs, then run this script again.'
      : 'No model is selected because the provider returned no model list. Fix provider access, then rerun this script.');
    return result;
  }

  const ask = async (useJsonMode, system, user) => {
    const response = await client.chat.completions.create({
      model, temperature: 0.2, max_completion_tokens: 256,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...(useJsonMode ? { response_format: { type: 'json_object' } } : {})
    });
    return response.choices?.[0]?.message?.content ?? '';
  };

  for (const useJsonMode of [true, false]) {
    const key = `json_mode=${useJsonMode}`;
    try {
      const text = await ask(useJsonMode, 'Reply with JSON only.', 'Return exactly this JSON object: {"ok":true,"pages":["https://example.com/"]}');
      const value = parseJsonObject(text);
      const valid = value?.ok === true && Array.isArray(value.pages) && value.pages[0] === 'https://example.com/';
      result.json[key] = { valid, response: valid ? value : text.slice(0, 400) };
      log(`\n${key}:`, result.json[key].response, valid ? '(valid)' : '(invalid JSON shape)');
      if (!valid) result.errors.push(`${key} did not return the expected JSON object.`);
    } catch (error) { const message = safeErrorMessage(error, apiKey); result.json[key] = { valid: false, error: message }; result.errors.push(`${key} failed: ${message}`); log(`\n${key}: FAILED (${error.status || ''} ${message})`); }
  }

  try {
    const text = await ask(jsonMode,
      'Choose exactly ONE next browser action as JSON only. Core action shapes use exact keys: '
      + '{"action":"goto","url":"...","reason":"..."}; '
      + '{"action":"click","n":2,"reason":"..."}; '
      + '{"action":"type","n":2,"text":"...","reason":"..."}; '
      + '{"action":"done","status":"passed|failed","reason":"..."}. '
      + 'Use n for the snapshot element number, never element or target. Do not add keys.',
      'Journey: open the pricing page. Snapshot elements: [{"n":1,"name":"Home"},{"n":2,"name":"Pricing"}]. '
      + 'Return exactly one click action using n=2 and a short reason.');
    const action = parseJsonObject(text);
    if (!isCoreAction(action)) throw new Error(`Model did not return a valid Core action object: ${text.slice(0, 300)}`);
    result.action = action;
    log('\naction test:', JSON.stringify(action));
  } catch (error) { const message = safeErrorMessage(error, apiKey); result.errors.push(`action test failed: ${message}`); log(`\naction test: FAILED (${error.status || ''} ${message})`); }
  return result;
}

async function main() {
  if (!config.llm.apiKey) { console.error('LLM_API_KEY is missing. Add your provider key to apps/api/.env.development; do not paste it into chat.'); process.exitCode = 1; return; }
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ baseURL: config.llm.baseURL, apiKey: config.llm.apiKey, timeout: config.llm.timeoutMs, maxRetries: 1 });
  console.log(`Provider: ${config.llm.provider}; endpoint: ${config.llm.baseURL}`);
  const result = await runSmoke({ client, model: config.llm.model, jsonMode: config.llm.jsonMode, log: (...args) => console.log(...args) });
  if (result.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(`LLM smoke test failed: ${safeErrorMessage(error)}`); process.exitCode = 1; });
