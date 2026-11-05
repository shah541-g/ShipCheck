import { Router } from 'express';
import { config } from '../config.js';
import { dockerCheck } from '../sandbox/runSandbox.js';
import { proxyHealthy } from '../sandbox/proxyClient.js';
import { llmConfigured } from '../llm/client.js';

export const meta = Router();

meta.get('/health', async (_req, res) => {
  const [docker, sandboxImage, proxy] = await Promise.all([
    dockerCheck(['version']), dockerCheck(['image', 'inspect', config.sandbox.image]), proxyHealthy(),
  ]);
  const body = { ok: docker && sandboxImage && proxy, docker, sandboxImage, proxy, llmConfigured: llmConfigured() };
  res.status(body.ok ? 200 : 503).json(body);
});

meta.get('/config', (_req, res) => {
  res.json({ demoUrl: config.demoHost ? `https://${config.demoHost}/` : null,
    maxPages: config.limits.maxPages, maxJourneys: config.limits.maxJourneys, vision: Boolean(config.llm.visionModel) });
});
