import { explore } from './explorer.js';
import { startSandbox } from '../sandbox/runSandbox.js';

// AI-side entry point: owns a runner only when the caller does not supply one.
// The explorer owns journey decisions; the driver independently rechecks actions.
export async function runExploration(job, {
  plan,
  scope,
  mode = 'safe',
  emit = () => {},
  sandbox: suppliedSandbox,
  stageTimeoutMs,
  startSandboxFn = startSandbox,
  decide
} = {}) {
  if (!job?.id) throw new TypeError('An audit job ID is required to start the sandbox');
  const ownsSandbox = !suppliedSandbox;
  const sandbox = suppliedSandbox || await startSandboxFn({
    jobId: job.id,
    stage: 'explore',
    init: { mode, scope },
    onEvent: emit,
    stageTimeoutMs
  });
  try {
    return await explore(job, sandbox, { plan, scope, mode, emit, ...(decide ? { decide } : {}) });
  } finally {
    if (ownsSandbox) await sandbox.close();
  }
}
