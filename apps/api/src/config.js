const integer = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const LLM_BASE_URLS = {
  vultr: 'https://api.vultrinference.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/'
};

export function resolveLlmConfig(env = process.env) {
  const provider = String(env.LLM_PROVIDER || 'gemini').trim().toLowerCase();
  return {
    provider,
    baseURL: String(env.LLM_BASE_URL || LLM_BASE_URLS[provider] || '').trim(),
    apiKey: env.LLM_API_KEY || '',
    model: env.LLM_MODEL || '',
    visionModel: env.LLM_VISION_MODEL || '',
    jsonMode: String(env.LLM_JSON_MODE ?? 'true').toLowerCase() === 'true',
    timeoutMs: integer(env.LLM_TIMEOUT_MS, 60000)
  };
}

export const config = {
  port: integer(process.env.PORT, 4000),
  appHost: process.env.APP_HOST || '',
  demoHost: process.env.DEMO_HOST || '',
  proxyAdminUrl: process.env.PROXY_ADMIN_URL || '',
  internalToken: process.env.INTERNAL_TOKEN || '',
  llm: resolveLlmConfig(),
  sandbox: {
    image: process.env.SANDBOX_IMAGE || 'shipcheck-sandbox:latest',
    network: process.env.SANDBOX_NETWORK || 'shipcheck-sandbox',
    runtime: process.env.SANDBOX_RUNTIME || 'runc',
    proxyUrl: process.env.SANDBOX_PROXY_URL || '',
    memory: '1g',
    memorySwap: '1g',
    cpus: '1',
    pidsLimit: 1024,
    tmpfs: '512m',
    shmSize: '512m'
  },
  limits: {
    maxPages: integer(process.env.MAX_PAGES, 12),
    maxJourneys: integer(process.env.MAX_JOURNEYS, 5),
    maxActionsPerJourney: integer(process.env.MAX_ACTIONS_PER_JOURNEY, 12),
    maxActionsPerAudit: integer(process.env.MAX_ACTIONS_PER_AUDIT, 40),
    maxLinksPerPage: integer(process.env.MAX_LINKS_PER_PAGE, 30),
    maxCandidates: integer(process.env.MAX_CANDIDATES, 50),
    pageTimeoutMs: integer(process.env.PAGE_TIMEOUT_MS, 20000),
    actionTimeoutMs: integer(process.env.ACTION_TIMEOUT_MS, 15000),
    discoverTimeoutMs: integer(process.env.DISCOVER_TIMEOUT_MS, 60000),
    exploreTimeoutMs: integer(process.env.EXPLORE_TIMEOUT_MS, 420000),
    verifyTimeoutMs: integer(process.env.VERIFY_TIMEOUT_MS, 240000)
  }
};
