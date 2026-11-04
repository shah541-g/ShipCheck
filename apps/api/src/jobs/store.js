import { mkdir, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { publish } from './events.js';

const jobs = new Map();
const saveTimers = new Map();
const saveChains = new Map();   // jobId -> the write currently in flight
let tmpSeq = 0;
const FINAL = new Set(['done', 'failed']);
const jobsDir = () => path.join(config.dataDir, 'jobs');

// A per-job secret masker: replaces the live test password with *** in any string we log or save.
const secrets = new Map(); // jobId -> password
export function registerSecret(jobId, password) { if (password) secrets.set(jobId, password); }
export function clearSecret(jobId) { secrets.delete(jobId); }
export function maskSecrets(jobId, text) {
  const pw = secrets.get(jobId);
  if (!pw || typeof text !== 'string') return text;
  return text.split(pw).join('***');
}

export async function loadJobs() {
  await mkdir(jobsDir(), { recursive: true });
  for (const file of await readdir(jobsDir())) {
    if (!file.endsWith('.json')) continue;
    try {
      const job = JSON.parse(await readFile(path.join(jobsDir(), file), 'utf8'));
      if (!FINAL.has(job.status)) {
        job.status = 'failed';
        job.error = { code: 'server_restarted', message: 'The server restarted while this audit was running. Please run it again.' };
        const ts = new Date().toISOString();
        job.events.push({ seq: job.events.length + 1, ts, type: 'error', stage: 'failed', message: job.error.message, data: { code: job.error.code } });
        job.updatedAt = ts;
        jobs.set(job.id, job);
        await saveJob(job, { now: true });
        continue;
      }
      jobs.set(job.id, job);
    } catch (err) {
      console.error(`Skipping unreadable job file ${file}: ${err.message}`);
    }
  }
}

// `login` carries the username/password only in memory; it is NEVER part of the saved job.
export function createJob(target, { mode = 'safe', login = null } = {}) {
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(), createdAt: now, updatedAt: now, status: 'queued', target,
    mode, hasLogin: Boolean(login), loginUrl: login?.url ?? null,
    _login: login,            // in-memory only; stripped on every save (see saveJob)
    pages: [], journeys: [], events: [], report: null, error: null,
  };
  jobs.set(job.id, job);
  if (login?.password) registerSecret(job.id, login.password);
  saveJob(job, { now: true });
  return job;
}

export const getJob = (id) => jobs.get(id) ?? null;

export function addEvent(job, { type, message, data }) {
  const event = { seq: job.events.length + 1, ts: new Date().toISOString(), type, stage: job.status,
    message: maskSecrets(job.id, message), ...(data ? { data } : {}) };
  job.events.push(event);
  job.updatedAt = event.ts;
  publish(job.id, event);
  saveJob(job);
  return event;
}

export function setStage(job, stage, message) {
  job.status = stage;
  addEvent(job, { type: 'stage', message: message ?? `Stage: ${stage}`, data: { stage } });
}

export function saveJob(job, { now = false } = {}) {
  clearTimeout(saveTimers.get(job.id));
  const write = async () => {
    saveTimers.delete(job.id);
    const file = path.join(jobsDir(), `${job.id}.json`);
    // Each write gets its own temp file. A shared `${file}.tmp` lets two saves
    // for one job clobber each other, and rename() then either publishes a
    // half-written file (unreadable on restart) or fails with ENOENT because
    // the other write already consumed the temp file, losing the save.
    const tmp = `${file}.${process.pid}.${++tmpSeq}.tmp`;
    try {
      const { _login, ...safe } = job;       // never write the login to disk
      await writeFile(tmp, JSON.stringify(safe));
      await rename(tmp, file);
    } catch (err) {
      console.error(`Could not save job ${job.id}: ${err.message}`);
      await rm(tmp, { force: true });
    }
  };
  // Writes for one job run one after another, so the last state always wins.
  const run = () => {
    const next = (saveChains.get(job.id) ?? Promise.resolve()).then(write, write);
    saveChains.set(job.id, next);
    next.then(() => { if (saveChains.get(job.id) === next) saveChains.delete(job.id); });
    return next;
  };
  if (now) return run();
  saveTimers.set(job.id, setTimeout(run, 500));
  return undefined;
}

export function publicJob(job) {
  const { id, createdAt, updatedAt, status, target, mode, hasLogin, loginUrl, pages, journeys, events, report, error } = job;
  return { id, createdAt, updatedAt, status, target, mode, hasLogin, loginUrl, pages, journeys, events, report, error };
}
