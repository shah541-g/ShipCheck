import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';

export const files = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

files.get('/:jobId/:name', (req, res) => {
  const { jobId, name } = req.params;
  if (config.storage.driver !== 'local' || !UUID.test(jobId) || !/^[0-9]+\.jpg$/.test(name)) return res.status(404).end();
  return res.sendFile(path.resolve(config.dataDir, 'files', jobId, name), (err) => { if (err && !res.headersSent) res.status(404).end(); });
});
