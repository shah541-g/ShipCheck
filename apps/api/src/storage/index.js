import { config } from '../config.js';
import * as local from './local.js';
import * as s3 from './s3.js';

const driver = config.storage.driver === 's3' ? s3 : local;
export const putScreenshot = (jobId, n, buffer) => driver.putScreenshot(jobId, n, buffer);
