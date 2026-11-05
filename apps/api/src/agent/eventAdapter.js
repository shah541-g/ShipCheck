import { config } from '../config.js';

const EVENT_TYPES = new Set([
  'stage', 'progress', 'agent_step', 'journey', 'finding',
  'blocked', 'warning', 'error', 'done'
]);
const EVENT_DATA_FIELDS = {
  stage: ['stage'],
  progress: ['url'],
  agent_step: ['journey', 'step', 'action', 'targetName', 'verdict', 'reason', 'screenshotUrl'],
  journey: ['title', 'status'],
  finding: ['severity', 'checkId'],
  blocked: ['layer', 'target', 'reason'],
  warning: [],
  error: ['code'],
  done: ['score', 'grade']
};
const NUMERIC_FIELDS = new Set(['step', 'score']);
const NULLABLE_STRING_FIELDS = new Set(['screenshotUrl']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function isScreenshotUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  if (value.startsWith('/')) {
    if (value.startsWith('//')) return false;
    try {
      const parsed = new URL(value, 'https://shipcheck.invalid');
      return parsed.origin === 'https://shipcheck.invalid' && parsed.pathname.startsWith('/api/files/');
    } catch { return false; }
  }
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}

function messageFor(type, data) {
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  if (type === 'blocked') {
    const layer = String(data.layer || 'unknown');
    const target = data.target ? String(data.target) : 'browser action';
    const reason = data.reason ? `: ${data.reason}` : '';
    return `BLOCKED (${layer}): ${target}${reason}`;
  }
  if (type === 'stage') return `Stage: ${String(data.stage || 'unknown')}`;
  if (type === 'journey') return `Journey ${String(data.title || '')}: ${String(data.status || 'finished')}`.trim();
  if (type === 'finding') return `Finding: ${String(data.checkId || 'website issue')}`;
  if (type === 'error') return `Job failed${data.code ? ` (${String(data.code)})` : ''}`;
  if (type === 'done') return 'The report is ready';
  return type === 'agent_step' ? 'Agent action' : type[0].toUpperCase() + type.slice(1);
}

/**
 * Adapt planner, explorer, analyzer, and sandbox callbacks to the documented
 * emit(type, data, message) shape, then hand the canonical store event to the
 * injected addEvent function. The function intentionally does not depend on
 * the job store module so the AI modules remain independently testable.
 */
export function createAgentEventAdapter({ job, addEvent, secrets = [] } = {}) {
  if (!job || typeof job !== 'object') throw new TypeError('An event job is required');
  if (typeof addEvent !== 'function') throw new TypeError('An addEvent function is required');
  const secretValues = [...new Set([
    config.llm.apiKey,
    config.internalToken,
    job._login?.username,
    job._login?.password,
    ...(Array.isArray(secrets) ? secrets : [])
  ].filter((value) => typeof value === 'string' && value.length > 0))];

  const redact = (value) => {
    if (typeof value !== 'string') return value;
    return secretValues.reduce((safe, secret) => safe.split(secret).join('[redacted]'), value);
  };

  return function emit(type, input = {}, explicitMessage) {
    if (!EVENT_TYPES.has(type)) throw new TypeError(`Unsupported ShipCheck event type: ${String(type)}`);

    // Analyzer callbacks use { message, data: { ... } }; the planner and
    // explorer use flat data and the runner may provide both forms.
    const envelope = isRecord(input) ? input : {};
    const nested = isRecord(envelope.data) ? envelope.data : {};
    const { message: inputMessage, data: _nestedData, ...flatData } = envelope;
    const suppliedData = { ...flatData, ...nested };
    const data = Object.fromEntries(EVENT_DATA_FIELDS[type]
      .filter((field) => Object.hasOwn(suppliedData, field))
      .filter((field) => {
        const value = suppliedData[field];
        if (NUMERIC_FIELDS.has(field)) return typeof value === 'number' && Number.isFinite(value);
        if (field === 'screenshotUrl') return value === null || isScreenshotUrl(value);
        if (NULLABLE_STRING_FIELDS.has(field)) return value === null || typeof value === 'string';
        return typeof value === 'string';
      })
      .map((field) => [field, redact(suppliedData[field])]));
    const rawMessage = typeof explicitMessage === 'string' && explicitMessage.trim()
      ? explicitMessage
      : messageFor(type, { ...data, ...(typeof inputMessage === 'string' ? { message: inputMessage } : {}) });
    const message = redact(rawMessage);

    return addEvent(job, {
      type,
      message,
      ...(Object.keys(data).length ? { data } : {})
    });
  };
}
