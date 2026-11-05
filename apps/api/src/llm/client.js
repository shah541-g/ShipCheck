import { config } from '../config.js';

export const llmConfigured = () => Boolean(config.llm.baseURL && config.llm.apiKey && config.llm.model);

let client = null;
export async function getClient() {
  if (!llmConfigured()) throw new Error('AI is not configured. Set LLM_PROVIDER, LLM_API_KEY, and LLM_MODEL in the API environment; set LLM_BASE_URL to override the provider default.');
  if (!client) {
    const { default: OpenAI } = await import('openai');
    client = new OpenAI({ baseURL: config.llm.baseURL, apiKey: config.llm.apiKey, timeout: config.llm.timeoutMs, maxRetries: 2 });
  }
  return client;
}

// Tests and smoke checks can replace the cached client without changing production config.
export function resetClientForTests() { client = null; }
