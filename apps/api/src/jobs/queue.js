import { config } from '../config.js';
import { addEvent } from './store.js';

const waiting = [];
let running = 0;

export function enqueue(job, run) {
  waiting.push({ job, run });
  pump();
  announcePositions();
}

function pump() {
  while (running < config.limits.maxConcurrentJobs && waiting.length) {
    const { job, run } = waiting.shift();
    running += 1;
    Promise.resolve()
      .then(() => run(job))
      .catch((err) => console.error(`Job ${job.id} crashed: ${err.stack ?? err}`))
      .finally(() => { running -= 1; pump(); announcePositions(); });
  }
}

function announcePositions() {
  waiting.forEach(({ job }, i) => addEvent(job, { type: 'progress', message: `Waiting for a free sandbox (position ${i + 1})` }));
}
