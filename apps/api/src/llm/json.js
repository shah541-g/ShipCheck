import { config } from '../config.js';
import { getClient, llmConfigured } from './client.js';

export class LlmError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'LlmError';
    if (options.code) this.code = options.code;
  }
}

export function extractJson(text) {
  const cleaned = String(text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch { return null; }
}

const safeError = (error) => {
  let message = String(error?.message || error || 'Unknown inference error');
  if (config.llm.apiKey) message = message.split(config.llm.apiKey).join('[redacted]');
  return message.slice(0, 500);
};

// One model request plus one corrective retry for invalid or malformed JSON.
// `user` can be plain text or OpenAI-compatible content parts.
export async function llmJson({ system, user, schema, model = config.llm.model, request, timeoutMs = config.llm.timeoutMs }) {
  if (!request && !llmConfigured()) throw new LlmError('AI is not configured. Set LLM_PROVIDER, LLM_API_KEY, and LLM_MODEL in the API environment; set LLM_BASE_URL to override the provider default.');
  const requestTimeoutMs = Number.isSafeInteger(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : config.llm.timeoutMs;
  const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
  let validationError = 'response was not valid JSON';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    let timer;
    try {
      const response = (async () => {
        if (request) return request({ model, messages: [...messages], attempt, signal: controller.signal });
        const response = await (await getClient()).chat.completions.create({
          model,
          messages,
          temperature: 0.2,
          ...(config.llm.jsonMode ? { response_format: { type: 'json_object' } } : {})
        }, { signal: controller.signal });
        return response.choices?.[0]?.message?.content ?? '';
      })();
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new LlmError(`AI request timed out after ${requestTimeoutMs} ms`, { code: 'timeout' }));
        }, requestTimeoutMs);
      });
      const text = await Promise.race([response, timeout]);
      clearTimeout(timer);

      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      validationError = parsed.error?.issues?.map((issue) => `${issue.path?.join('.') || 'root'}: ${issue.message}`).join('; ') || validationError;
      if (attempt === 0) {
        messages.push(
          { role: 'assistant', content: typeof text === 'string' ? text : JSON.stringify(text) },
          { role: 'user', content: `That reply was not valid. Problems: ${validationError}. Reply again with JSON only, matching the requested shape exactly.` }
        );
      }
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof LlmError && error.code === 'timeout') throw error;
      throw new LlmError(`AI request failed: ${safeError(error)}`, { cause: error });
    }
  }
  throw new LlmError(`AI did not return valid JSON after one retry: ${validationError}`);
}
