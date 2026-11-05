import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { addEvent, getJob } from '../jobs/store.js';

export const internal = Router();

internal.post('/events', (req, res) => {
  const given = Buffer.from(String(req.get('x-internal-token') ?? ''));
  const expected = Buffer.from(config.internalToken);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(401).end();
  const { jobId, layer, target, reason } = req.body ?? {};
  const job = typeof jobId === 'string' ? getJob(jobId) : null;
  if (!job) return res.status(404).end();
  const safe = (v) => String(v ?? '').slice(0, 300);
  addEvent(job, { type: 'blocked', message: `BLOCKED (${safe(layer)}): ${safe(target)}: ${safe(reason)}`,
    data: { layer: safe(layer), target: safe(target), reason: safe(reason) } });
  return res.status(204).end();
});
