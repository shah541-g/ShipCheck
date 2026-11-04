import { EventEmitter } from 'node:events';

// In-memory pub/sub: one channel per job id. Used by the SSE route.
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publish(jobId, event) { bus.emit(jobId, event); }
export function subscribe(jobId, listener) { bus.on(jobId, listener); return () => bus.off(jobId, listener); }
