import { z } from 'zod';
import { config } from '../config.js';
import { llmJson } from '../llm/json.js';
import { PLAN_SYSTEM } from '../llm/prompts.js';

const PlanSchema = z.object({
  journeys: z.array(z.object({ title: z.string(), goal: z.string().optional().default('') })).max(10).default([]),
  pages: z.array(z.object({ url: z.string(), reason: z.string().optional().default('') })).max(20).default([])
});

const depth = (url) => {
  try { return new URL(url).pathname.split('/').filter(Boolean).length; }
  catch { return Number.MAX_SAFE_INTEGER; }
};

export function fallbackPages(candidates, home, max = config.limits.maxPages) {
  const unique = [...new Map((Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => typeof candidate?.url === 'string')
    .map((candidate) => [candidate.url, candidate])).values()];
  const selectedHome = unique.some((candidate) => candidate.url === home)
    ? home
    : unique[0]?.url;
  if (!selectedHome) return [];
  const rest = unique.filter((candidate) => candidate.url !== selectedHome)
    .sort((a, b) => depth(a.url) - depth(b.url) || a.url.length - b.url.length);
  return [selectedHome, ...rest.map((candidate) => candidate.url)]
    .slice(0, max)
    .map((url, index) => ({ url, reason: index === 0 ? 'Start page' : 'Shortest discovered path' }));
}

// The AI may select discovered pages only. Invalid suggestions are visible as BLOCKED (ai).
export async function planJourneysAndPages(job, discover, {
  emit = () => {}, request, timeoutMs,
  maxPages = config.limits.maxPages,
  maxJourneys = config.limits.maxJourneys
} = {}) {
  const candidates = Array.isArray(discover?.candidates) ? discover.candidates : [];
  // The shared plan contract only permits URLs present in discovery candidates.
  const home = candidates.find((candidate) => typeof candidate?.url === 'string')?.url;
  const allowed = new Set(candidates.map((candidate) => candidate.url));
  const fallback = ({ planningAvailable = false } = {}) => ({
    journeys: [],
    pages: fallbackPages(candidates, home, maxPages),
    ai: { planningAvailable, journeysStatus: 'not_run' }
  });
  if (!home) return fallback();

  let journeys = [];
  let pages = [];
  try {
    const result = await llmJson({
      system: PLAN_SYSTEM(maxJourneys, maxPages),
      user: JSON.stringify({ candidates: candidates.slice(0, 50) }),
      schema: PlanSchema,
      ...(timeoutMs ? { timeoutMs } : {}),
      ...(request ? { request } : {})
    });
    journeys = result.journeys.slice(0, maxJourneys).map((journey, i) => ({ id: `j${i + 1}`, title: journey.title.trim().slice(0, 80), goal: journey.goal.trim().slice(0, 200) }));
    const reasons = new Map();
    for (const page of result.pages) {
      if (!allowed.has(page.url)) {
        emit('blocked', { layer: 'ai', target: page.url, reason: 'AI chose a URL that was not discovered on the site.' });
        continue;
      }
      if (!reasons.has(page.url)) reasons.set(page.url, page.reason.trim().slice(0, 120));
    }
    pages = [home, ...[...reasons.keys()].filter((url) => url !== home)]
      .slice(0, maxPages)
      .map((url) => ({
        url,
        reason: reasons.get(url) || (url === home ? 'Start page' : 'Selected by AI')
      }));
    if (pages.length < Math.min(2, candidates.length)) {
      emit('warning', { message: 'AI selected too few discovered pages; using built-in page selection, no journeys.' });
      return fallback({ planningAvailable: true });
    }
    emit('progress', { message: `AI planned ${journeys.length} journeys${journeys.length ? `: ${journeys.map((j) => j.title).join('; ')}` : ''}` });
    return { journeys, pages, ai: { planningAvailable: true, journeysStatus: journeys.length ? 'planned' : 'not_run' } };
  } catch (error) {
    emit('warning', { message: `AI planning unavailable (${error.message}); using the built-in page selection, no journeys.` });
    return fallback();
  }
}
