import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { normalizeTarget, PolicyError } from '../security/policy.js';
import { createJob, getJob, publicJob } from '../jobs/store.js';
import { enqueue } from '../jobs/queue.js';
import { subscribe } from '../jobs/events.js';
import { runJob } from '../agent/pipeline.js';
import { toMarkdown } from '../agent/markdown.js';

export const jobs = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Core: only a URL. The Stretch section extends this to accept login + staging.
const Body = z.object({ url: z.string().min(1).max(2048) });

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: config.limits.rateLimitPerHour, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many audits from your network. Try again later.' }),
});

jobs.post('/', createLimiter, (req, res) => {
  const body = Body.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Please send a JSON body like {"url":"https://example.com"}' });
  let target;
  try { target = normalizeTarget(body.data.url); }
  catch (err) { if (err instanceof PolicyError) return res.status(400).json({ error: err.message }); throw err; }
  const job = createJob(target, { mode: 'safe', login: null });   // Core: safe mode, no login
  enqueue(job, runJob);
  return res.status(202).json({ id: job.id });
});

jobs.param('id', (req, res, next, id) => {
  const job = UUID.test(id) ? getJob(id) : null;
  if (!job) return res.status(404).json({ error: 'Job not found' });
  req.job = job;
  return next();
});

jobs.get('/:id', (req, res) => res.json(publicJob(req.job)));

jobs.get('/:id/events', (req, res) => {
  const job = req.job;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (ev) => res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
  const after = Number(req.get('Last-Event-ID')) || 0;
  for (const ev of job.events) if (ev.seq > after) send(ev);
  const unsubscribe = subscribe(job.id, send);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { unsubscribe(); clearInterval(ping); });
});

const fileName = (job, ext) => `shipcheck-${job.target.host.replace(/[^a-z0-9.-]/gi, '')}.${ext}`;
jobs.get('/:id/report.md', (req, res) => {
  if (!req.job.report) return res.status(409).json({ error: 'Report not ready' });
  return res.attachment(fileName(req.job, 'md')).type('text/markdown').send(toMarkdown(req.job));
});
jobs.get('/:id/report.json', (req, res) => {
  if (!req.job.report) return res.status(409).json({ error: 'Report not ready' });
  return res.attachment(fileName(req.job, 'json')).json(req.job.report);
});
