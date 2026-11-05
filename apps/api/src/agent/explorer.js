import { config } from '../config.js';
import { llmJson } from '../llm/json.js';
import { DECIDE_ACTION_SYSTEM } from '../llm/prompts.js';
import { ActionSchema, checkAction } from '../security/actionGuard.js';
import { isInScope } from '../security/policy.js';

const targetName = (action, snapshot) => (typeof action.n === 'number' ? snapshot.elements?.find((element) => element.n === action.n)?.name : action.url) || action.action;

export async function decideAction(journey, snapshot, history, mode = 'safe', { request } = {}) {
  const safeText = String(snapshot.textExcerpt || '').replace(/<\/?untrusted_page_text>/gi, '');
  const user = `Journey goal: ${journey.goal || journey.title}\n`
    + `History (most recent last):\n${history.slice(-6).join('\n') || '(nothing yet)'}\n\n`
    + `Current page: ${snapshot.url}\nTitle: ${snapshot.title || ''}\n`
    + `Elements: ${JSON.stringify(snapshot.elements || [])}\n\n`
    + `<untrusted_page_text>\n${safeText}\n</untrusted_page_text>`;
  return llmJson({ system: DECIDE_ACTION_SYSTEM(mode), user, schema: ActionSchema, ...(request ? { request } : {}) });
}

function actionHistory(action, name, destination, result) {
  const target = action.action === 'type' ? `element ${action.n}` : name;
  return `action=${action.action} target=${target} destination=${destination || '(same page)'}${result?.nothingHappened ? ' (nothing happened)' : ''}`;
}

function emitAgentStep(emit, journey, step, action, targetName, verdict, reason, screenshotUrl) {
  const message = `Journey '${journey}' · step ${step}: ${action}${targetName ? ` "${targetName}"` : ''} → ${verdict === 'allowed' ? 'ALLOWED' : 'BLOCKED'}`;
  // Keep Event.message separate from the contract's Event.data payload for the pipeline adapter.
  emit('agent_step', {
    journey, step, action, targetName, verdict, reason, screenshotUrl
  }, message);
}

export async function explore(job, sandbox, {
  plan, scope, mode = 'safe', emit = () => {}, decide = decideAction,
  maxActionsPerJourney = config.limits.maxActionsPerJourney,
  maxActionsPerAudit = config.limits.maxActionsPerAudit
} = {}) {
  const home = job.target.url;
  const inScope = (url) => isInScope(url, scope?.hosts || []);
  const auditedUrls = new Set();
  const pages = [];
  let totalActions = 0;
  let decisionAttempts = 0;
  let decisionFailures = 0;

  const openPage = async (url) => {
    if (!inScope(url)) {
      emit('blocked', { layer: 'ai', target: String(url), reason: 'Navigation outside the site under test' });
      return false;
    }
    await sandbox.act({ cmd: 'open', url });
    return true;
  };

  const auditUrl = async (url) => {
    if (!inScope(url)) {
      emit('blocked', { layer: 'ai', target: String(url), reason: 'Audit outside the site under test' });
      return null;
    }
    try {
      const measured = await sandbox.act({ cmd: 'audit', url });
      const finalUrl = measured.url || url;
      if (auditedUrls.has(finalUrl)) return pages.find((page) => page.url === finalUrl) || measured;
      auditedUrls.add(finalUrl);
      pages.push(measured);
      emit('progress', { url: finalUrl, message: `Audited ${finalUrl} (${measured.status ?? 'unknown'})` });
      return measured;
    } catch (error) {
      emit('warning', { message: `Could not audit ${url}: ${error.message}` });
      return null;
    }
  };

  try {
    if (await openPage(home)) await auditUrl(home);
  } catch (error) {
    emit('warning', { message: `Could not open the home page for journeys: ${error.message}` });
  }

  const journeys = [];
  for (const [index, planned] of (plan?.journeys || []).entries()) {
    if (totalActions >= maxActionsPerAudit) break;
    const journey = { id: planned.id || `j${index + 1}`, title: planned.title, goal: planned.goal || '', status: 'not_finished', failedStep: null, reason: '', steps: [] };
    const history = [];
    const actionKeys = [];
    let hadBlocked = false;
    let hadAllowedAction = false;

    try {
      if (!await openPage(home)) {
        journey.reason = 'Could not start the journey: navigation outside the site under test.';
        journeys.push(journey);
        emit('journey', { title: journey.title, status: journey.status, reason: journey.reason });
        continue;
      }
    } catch (error) {
      journey.reason = `Could not start the journey: ${error.message}`;
      emit('warning', { message: `Could not start journey "${journey.title}".` });
      journeys.push(journey);
      emit('journey', { title: journey.title, status: journey.status, reason: journey.reason });
      continue;
    }
    emit('progress', { message: `Starting journey: ${journey.title}` });

    for (let stepNo = 1; stepNo <= maxActionsPerJourney && totalActions < maxActionsPerAudit; stepNo += 1) {
      totalActions += 1;
      let snapshot;
      try { snapshot = await sandbox.act({ cmd: 'snapshot' }); }
      catch (error) { journey.reason = `Could not observe the page: ${error.message}`; break; }

      let action;
      decisionAttempts += 1;
      try { action = await decide(journey, snapshot, history, mode); }
      catch (error) {
        decisionFailures += 1;
        journey.reason = `AI unavailable (${error.message})`;
        emit('warning', { message: `AI could not choose an action for "${journey.title}"; ending it. Automatic page checks will continue.` });
        break;
      }

      const name = targetName(action, snapshot);
      const verdict = checkAction(action, snapshot, { scopeHosts: scope?.hosts || [], mode, hasLogin: false, loginUsed: false });
      const key = `${action.action}:${action.action === 'type' ? action.n : name}`;
      actionKeys.push(key);
      const step = {
        n: stepNo,
        action: action.action,
        targetName: name === action.action ? '' : name,
        reason: action.reason || '',
        verdict: verdict.ok ? 'allowed' : 'blocked',
        fromUrl: snapshot.url,
        toUrl: snapshot.url,
        nothingHappened: false,
        newErrors: [],
        screenshotUrl: null,
        screenshotB64: null
      };
      emitAgentStep(emit, journey.title, stepNo, action.action, step.targetName, step.verdict, action.reason || '', null);

      if (!verdict.ok) {
        hadBlocked = true;
        step.reason = `${step.reason}${step.reason ? ' ' : ''}Blocked by the action guard: ${verdict.reason}`;
        emit('blocked', { layer: 'ai', target: step.targetName || action.action, reason: verdict.reason });
        journey.steps.push(step);
        history.push(`step ${stepNo}: ${action.action} ${step.targetName || ''} -> BLOCKED (${verdict.reason}). Pick a different safe action.`);
      } else if (action.action === 'done') {
        journey.status = action.status;
        journey.reason = action.reason || '';
        if (action.status === 'failed') journey.failedStep = stepNo;
        journey.steps.push(step);
        break;
      } else {
        let result;
        try { result = await sandbox.act({ cmd: 'act', action: verdict.action }); }
        catch (error) {
          result = { newUrl: snapshot.url, nothingHappened: true, newErrors: [error.message] };
          emit('warning', { message: `Action ${stepNo} in "${journey.title}" did not finish: ${error.message}` });
        }
        hadAllowedAction = true;
        step.toUrl = result.newUrl || snapshot.url;
        step.nothingHappened = Boolean(result.nothingHappened);
        step.newErrors = result.newErrors || [];
        history.push(`step ${stepNo}: ${actionHistory(action, name, result.newUrl, result)}`);

        let landedPage = null;
        if (result.newUrl && inScope(result.newUrl) && !auditedUrls.has(result.newUrl)) landedPage = await auditUrl(result.newUrl);
        // The runner returns screenshot bytes; the report builder owns storage and
        // replaces screenshotB64 with a public screenshotUrl after upload.
        step.screenshotB64 = landedPage?.screenshot || null;
        const httpStatus = Number(result.status || result.httpStatus || landedPage?.status || 0);
        const errorText = step.newErrors.join(' ');
        if (httpStatus >= 400 || /\b(?:HTTP\s*)?404\b/.test(errorText)) {
          if (!/\b(?:HTTP\s*)?404\b|\b5\d\d\b/.test(errorText) && httpStatus >= 400) step.newErrors.push(`HTTP ${httpStatus}`);
          journey.status = 'failed';
          journey.failedStep = stepNo;
          journey.reason = `The action led to an HTTP ${httpStatus >= 400 ? httpStatus : 404} error page.`;
        }
        journey.steps.push(step);
        if (journey.status === 'failed') break;
      }

      if (actionKeys.length >= 3 && actionKeys.slice(-3).every((key) => key === actionKeys.at(-1))) {
        journey.reason = 'The agent repeated the same action without progress.';
        if (hadBlocked && !hadAllowedAction) journey.status = 'stopped_by_guard';
        break;
      }
    }

    if (journey.status === 'not_finished' && hadBlocked && !hadAllowedAction && !journey.reason.includes('AI unavailable')) {
      journey.status = 'stopped_by_guard';
      if (!journey.reason) journey.reason = 'A required journey action was blocked by the safety guard.';
    }
    if (journey.status === 'not_finished' && !journey.reason) journey.reason = 'Reached the action budget before finishing.';
    journeys.push(journey);
    emit('journey', { title: journey.title, status: journey.status, reason: journey.reason });
  }

  // Still audit planned key pages that the journeys did not reach.
  for (const page of plan?.pages || []) {
    const url = typeof page === 'string' ? page : page?.url;
    if (typeof url !== 'string' || !url) continue;
    if (auditedUrls.has(url)) continue;
    try { if (await openPage(url)) await auditUrl(url); }
    catch (error) { emit('warning', { message: `Skipped planned page ${url}: ${error.message}` }); }
  }
  const planningAvailable = plan?.ai?.planningAvailable ?? null;
  let journeysStatus = plan?.ai?.journeysStatus === 'not_run' || journeys.length === 0 || decisionAttempts === 0
    ? 'not_run'
    : 'run';
  if (decisionFailures > 0) {
    const successfulJourneys = journeys.filter((journey) => journey.steps.length > 0).length;
    journeysStatus = successfulJourneys > 0 ? 'partially_run' : 'not_run';
  }
  return {
    pages,
    journeys,
    actionsUsed: totalActions,
    ai: {
      planningAvailable,
      executionAvailable: decisionAttempts > 0 ? decisionFailures === 0 : null,
      journeysStatus
    }
  };
}
