import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackPages, planJourneysAndPages } from '../src/agent/plan.js';

const candidates = [
  { url: 'https://demo.example/', text: 'home' },
  { url: 'https://demo.example/deep/page', text: 'deep' },
  { url: 'https://demo.example/pricing', text: 'Pricing, Start free trial' },
  { url: 'https://demo.example/about', text: 'About' }
];

test('fallback puts home first and selects shortest-path pages', () => {
  assert.deepEqual(fallbackPages(candidates, candidates[0].url, 3), [
    { url: candidates[0].url, reason: 'Start page' },
    { url: candidates[3].url, reason: 'Shortest discovered path' },
    { url: candidates[2].url, reason: 'Shortest discovered path' }
  ]);
});

test('planner keeps discovered pages, includes Start Free Trial, and blocks invented URLs', async () => {
  const events = [];
  const output = await planJourneysAndPages({ target: { url: candidates[0].url } }, { candidates }, {
    emit: (type, data) => events.push({ type, data }),
    request: async () => JSON.stringify({
      journeys: [{ title: 'Start Free Trial', goal: 'Open pricing and test the free trial link.' }],
      pages: [{ url: candidates[2].url, reason: 'Pricing' }, { url: 'https://invented.example/signup', reason: 'Invented' }]
    })
  });
  assert.deepEqual(output.pages, [
    { url: candidates[0].url, reason: 'Start page' },
    { url: candidates[2].url, reason: 'Pricing' }
  ]);
  assert.equal(output.journeys[0].title, 'Start Free Trial');
  assert.ok(events.some((event) => event.type === 'blocked' && event.data.layer === 'ai' && event.data.target === 'https://invented.example/signup'));
});

test('planner falls back to pages and no journeys when AI is unavailable', async () => {
  const events = [];
  const output = await planJourneysAndPages({ target: { url: candidates[0].url } }, { candidates }, {
    emit: (type, data) => events.push({ type, data }),
    request: async () => { throw Object.assign(new Error('invalid API key'), { status: 401 }); }
  });
  assert.deepEqual(output, {
    journeys: [],
    pages: fallbackPages(candidates, candidates[0].url, 12),
    ai: { planningAvailable: false, journeysStatus: 'not_run' }
  });
  assert.ok(events.some((event) => event.type === 'warning' && /no journeys/.test(event.data.message)));
});

test('planner uses home and shortest pages after malformed model replies', async () => {
  let calls = 0;
  const output = await planJourneysAndPages({ target: { url: candidates[0].url } }, { candidates }, {
    request: async () => { calls += 1; return '{malformed'; }
  });

  assert.equal(calls, 2, 'malformed JSON receives one corrective retry');
  assert.deepEqual(output.journeys, []);
  assert.deepEqual(output.pages, fallbackPages(candidates, candidates[0].url, 12));
  assert.deepEqual(output.ai, { planningAvailable: false, journeysStatus: 'not_run' });
});

test('planner times out and still returns the deterministic page fallback', async () => {
  let signal;
  const output = await planJourneysAndPages({ target: { url: candidates[0].url } }, { candidates }, {
    timeoutMs: 15,
    request: ({ signal: requestSignal }) => { signal = requestSignal; return new Promise(() => {}); }
  });

  assert.equal(signal.aborted, true);
  assert.deepEqual(output.journeys, []);
  assert.deepEqual(output.pages, fallbackPages(candidates, candidates[0].url, 12));
  assert.deepEqual(output.ai, { planningAvailable: false, journeysStatus: 'not_run' });
});

test('planner does not promote an undiscovered final URL when discovery has no candidates', async () => {
  let calls = 0;
  const output = await planJourneysAndPages({ target: { url: candidates[0].url } }, {
    finalUrl: candidates[0].url,
    candidates: []
  }, { request: async () => { calls += 1; return '{"journeys":[],"pages":[]}'; } });

  assert.equal(calls, 0);
  assert.deepEqual(output, {
    journeys: [],
    pages: [],
    ai: { planningAvailable: false, journeysStatus: 'not_run' }
  });
});

test('planner limits results, removes duplicate pages, and home remains first', async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ url: `https://demo.example/${i}`, reason: 'page' }));
  const output = await planJourneysAndPages({ target: { url: candidates[0].url } }, { candidates: [candidates[0], ...many] }, {
    maxJourneys: 2, maxPages: 3,
    request: async () => JSON.stringify({ journeys: Array.from({ length: 7 }, (_, i) => ({ title: `J${i}`, goal: 'Test' })), pages: [many[1], many[1], many[2]] })
  });
  assert.equal(output.journeys.length, 2);
  assert.equal(output.pages.length, 3);
  assert.equal(output.pages[0].url, candidates[0].url);
assert.equal(new Set(output.pages.map(page => page.url)).size, output.pages.length);
});
