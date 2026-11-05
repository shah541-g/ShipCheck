import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export async function putScreenshot(jobId, n, buffer) {
  const dir = path.join(config.dataDir, 'files', jobId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${n}.jpg`), buffer);
  return `/api/files/${jobId}/${n}.jpg`;
}
