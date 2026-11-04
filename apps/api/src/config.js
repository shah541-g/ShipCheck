// Reads every setting from the environment once. Other modules import `config`.
const str = (name, fallback = '') => process.env[name] ?? fallback;
const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return n;
};

export const config = Object.freeze({
  port: num('PORT', 4000),
  appHost: str('APP_HOST').toLowerCase(),
  demoHost: str('DEMO_HOST').toLowerCase(),
  corsOrigin: str('CORS_ORIGIN'),
  llm: Object.freeze({
    baseURL: str('LLM_BASE_URL', 'https://api.vultrinference.com/v1'),
    apiKey: str('LLM_API_KEY'),
    model: str('LLM_MODEL'),
    visionModel: str('LLM_VISION_MODEL'),
    jsonMode: str('LLM_JSON_MODE', 'true') === 'true',
    timeoutMs: num('LLM_TIMEOUT_MS', 60000),
  }),
  internalToken: str('INTERNAL_TOKEN'),
  proxyAdminUrl: str('PROXY_ADMIN_URL', 'http://egress-proxy:8080'),
  sandbox: Object.freeze({
    proxyUrl: str('SANDBOX_PROXY_URL', 'http://172.30.0.10:3128'),
    image: str('SANDBOX_IMAGE', 'shipcheck-sandbox:latest'),
    network: str('SANDBOX_NETWORK', 'shipcheck-sandbox'),
    runtime: str('SANDBOX_RUNTIME', 'runc'),
  }),
  limits: Object.freeze({
    maxPages: num('MAX_PAGES', 12),
    maxJourneys: num('MAX_JOURNEYS', 5),
    maxActionsPerJourney: num('MAX_ACTIONS_PER_JOURNEY', 12),
    maxActionsPerAudit: num('MAX_ACTIONS_PER_AUDIT', 40),
    maxCandidates: num('MAX_CANDIDATES', 50),
    maxLinksPerPage: num('MAX_LINKS_PER_PAGE', 30),
    pageTimeoutMs: num('PAGE_TIMEOUT_MS', 20000),
    actionTimeoutMs: num('ACTION_TIMEOUT_MS', 15000),
    discoverTimeoutMs: num('DISCOVER_TIMEOUT_MS', 60000),
    exploreTimeoutMs: num('EXPLORE_TIMEOUT_MS', 420000),
    verifyTimeoutMs: num('VERIFY_TIMEOUT_MS', 240000),
    maxConcurrentJobs: num('MAX_CONCURRENT_JOBS', 2),
    rateLimitPerHour: num('RATE_LIMIT_PER_HOUR', 5),
  }),
  dataDir: str('DATA_DIR', './data'),
  storage: Object.freeze({
    driver: str('STORAGE_DRIVER', 'local'),
    s3Hostname: str('S3_HOSTNAME'),
    s3Bucket: str('S3_BUCKET'),
    s3AccessKey: str('S3_ACCESS_KEY'),
    s3SecretKey: str('S3_SECRET_KEY'),
  }),
});

export function assertConfig() {
  if (config.internalToken.length < 32) throw new Error('INTERNAL_TOKEN must be set (at least 32 characters)');
  if (!['runc', 'runsc'].includes(config.sandbox.runtime)) throw new Error('SANDBOX_RUNTIME must be runc or runsc');
  if (!['local', 's3'].includes(config.storage.driver)) throw new Error('STORAGE_DRIVER must be local or s3');
  if (config.storage.driver === 's3' && !(config.storage.s3Hostname && config.storage.s3Bucket && config.storage.s3AccessKey && config.storage.s3SecretKey)) {
    throw new Error('STORAGE_DRIVER=s3 needs S3_HOSTNAME, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY');
  }
  if (!config.llm.apiKey || !config.llm.model) console.warn('AI is not configured: journeys are skipped and reports use built-in guidance.');
}
