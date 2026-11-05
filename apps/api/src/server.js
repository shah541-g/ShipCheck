import express from 'express';
import cors from 'cors';
import { config, assertConfig } from './config.js';
import { loadJobs } from './jobs/store.js';
import { meta } from './routes/meta.js';
import { jobs } from './routes/jobs.js';
import { files } from './routes/files.js';
import { internal } from './routes/internal.js';

assertConfig();
await loadJobs();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
if (config.corsOrigin) app.use('/api', cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '10kb' }));

app.use('/api', meta);
app.use('/api/jobs', jobs);
app.use('/api/files', files);
app.use('/internal', internal);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  if (!res.headersSent) res.status(status).json({ error: status === 500 ? 'Internal error' : 'Bad request' });
});

app.listen(config.port, () => console.log(`ShipCheck api listening on :${config.port}`));
