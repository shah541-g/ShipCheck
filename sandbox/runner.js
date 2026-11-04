// ShipCheck sandbox runner (v2) — a COMMAND SERVER.
// First stdin line: an init object (launches Chromium, prints {"ready":true}).
// Then: one JSON command per line. For each, do the work and print ONE JSON reply line to stdout.
// stderr: progress/blocked lines (one JSON object per line) + Chromium's own logs.
// There is no "run script" command: the only ways to act are click/type/select/goto, and the
// browser write-guard (L3) decides what may leave the sandbox.
import readline from 'node:readline';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|rar|7z|gz|mp4|mp3|webm|mov|avi|docx?|xlsx?|pptx?)$/i;
const INJECTION_PATTERNS = [
  /ignore (all |any )?(the )?(previous|prior|above|earlier) instructions/i,
  /disregard (all |any )?(the )?(previous|prior|above) (instructions|prompts)/i,
  /\b(ai|llm) (agents?|assistants?|models?)\b[^.]{0,80}\b(must|should|need to)\b/i,
  /\bsystem prompt\b/i,
];
const IGNORED_FAILURES = /ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/;
const CLICKABLE = 'a[href], button, input, select, textarea, [role=button], [role=link], [role=tab], [role=menuitem]';

const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const emit = (ev) => process.stderr.write(`${JSON.stringify(ev)}\n`);
const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };

function normalizeLink(href, base) {
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch { return null; }
}
function countSecretLikeEnv() {
  return Object.keys(process.env).filter((k) => /KEY|TOKEN|SECRET|PASSWORD/i.test(k)).length;
}

// ---- shared browser state for the whole stage ----
const S = {
  browser: null, context: null, page: null,
  inScope: () => false, mode: 'safe', limits: null, deadline: 0,
  allowWritesForLogin: false,   // flipped true only during a login action (Stretch)
  errors: [], errMark: 0,       // console/js/network errors; newErrors = slice since errMark
  linkCache: new Map(),
  audited: new Set(),           // URLs already audited this stage (de-dup)
};
const takeNewErrors = () => { const e = S.errors.slice(S.errMark); S.errMark = S.errors.length; return e; };

// L3 browser write-guard, on the whole context so popups are covered too.
async function guardContext(context) {
  await context.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    // Off-site requests of any kind are blocked (the proxy would block them too; this is clearer + faster).
    if (!/^https?:/i.test(url)) return route.continue();
    if (!S.inScope(url)) {
      emit({ type: 'blocked', layer: 'browser', target: url, reason: 'Request outside the site under test' });
      return route.abort('aborted');
    }
    // Safe mode: no writes leave the sandbox, except during the one login action (Stretch).
    const isWrite = !['GET', 'HEAD'].includes(method);
    if (isWrite && S.mode === 'safe' && !S.allowWritesForLogin) {
      emit({ type: 'blocked', layer: 'browser', target: url, reason: `Write request blocked in safe mode (${method})` });
      return route.abort('aborted');
    }
    return route.continue();
  });
}

function attachErrorListeners(page) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const src = msg.location()?.url || '';
    if (text.includes('ERR_TUNNEL_CONNECTION_FAILED') || (src && !S.inScope(src))) return;
    S.errors.push(`console: ${text.slice(0, 200)}`);
  });
  page.on('pageerror', (err) => S.errors.push(`js: ${String(err?.message ?? err).slice(0, 200)}`));
  page.on('requestfailed', (req) => {
    if (!S.inScope(req.url())) return;
    const reason = req.failure()?.errorText ?? 'failed';
    if (IGNORED_FAILURES.test(reason)) return;
    S.errors.push(`request: ${req.method()} ${req.url()} ${reason}`);
  });
  page.on('response', (res) => { if (S.inScope(res.url()) && res.status() >= 400) S.errors.push(`http: ${res.status()} ${res.url()}`); });
}

async function setup(init) {
  const hosts = new Set((init.scope?.hosts ?? []).map((h) => h.toLowerCase()));
  S.inScope = (url) => hosts.has(hostOf(url));
  S.mode = init.mode === 'staging' ? 'staging' : 'safe';
  S.limits = init.limits;
  S.deadline = init.deadline ?? (Date.now() + 600000);
  const proxy = init.proxy ?? undefined;
  S.browser = await chromium.launch({ proxy });
  S.context = await S.browser.newContext({ proxy, viewport: { width: 1366, height: 768 }, bypassCSP: true, serviceWorkers: 'block' });
  S.context.setDefaultNavigationTimeout(init.limits.pageTimeoutMs);
  S.context.setDefaultTimeout(init.limits.actionTimeoutMs);
  S.context.on('dialog', (d) => d.dismiss().catch(() => {}));   // always Cancel confirm/alert
  await guardContext(S.context);
  S.page = await S.context.newPage();
  attachErrorListeners(S.page);
}

async function safeGet(url) {
  try {
    const res = await S.context.request.get(url, { timeout: 8000, maxRedirects: 3 });
    const ok = res.ok();
    return { ok, body: ok ? (await res.text()).slice(0, 500000) : '' };
  } catch { return { ok: false, body: '' }; }
}

async function cmdDiscover(startUrl) {
  emit({ type: 'progress', message: `Opening ${startUrl}`, url: startUrl });
  const response = await S.page.goto(startUrl, { waitUntil: 'load' });
  const finalUrl = S.page.url();
  const anchors = await S.page.$$eval('a[href]', (els) =>
    els.map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 80) })));
  const candidates = new Map([[finalUrl, { url: finalUrl, text: '(start page)' }]]);
  const external = new Map();
  for (const a of anchors) {
    const url = normalizeLink(a.href, finalUrl);
    if (!url || SKIP_EXT.test(new URL(url).pathname)) continue;
    if (!S.inScope(url)) { if (!external.has(url)) external.set(url, { url, text: a.text }); continue; }
    if (!candidates.has(url)) candidates.set(url, { url, text: a.text });
  }
  const origin = new URL(finalUrl).origin;
  const robots = await safeGet(`${origin}/robots.txt`);
  const sitemap = await safeGet(`${origin}/sitemap.xml`);
  const sitemapOk = sitemap.ok && /<urlset|<sitemapindex/i.test(sitemap.body);
  if (sitemapOk) {
    for (const m of sitemap.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      if (candidates.size >= S.limits.maxCandidates) break;
      const url = normalizeLink(m[1], origin);
      if (url && S.inScope(url) && !url.endsWith('.xml') && !candidates.has(url)) candidates.set(url, { url, text: '(from sitemap)' });
    }
  }
  return {
    startUrl, finalUrl, status: response?.status() ?? 0,
    candidates: [...candidates.values()].slice(0, S.limits.maxCandidates),
    externalLinks: [...external.values()].slice(0, 50),
    site: { robotsTxt: robots.ok && !/<html/i.test(robots.body), sitemap: sitemapOk },
    envSecretsCount: countSecretLikeEnv(),
  };
}

async function cmdOpen(url) {
  const res = await S.page.goto(url, { waitUntil: 'load' }).catch((e) => { S.errors.push(`nav: ${String(e.message).split('\n')[0]}`); return null; });
  await S.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  return { url: S.page.url(), status: res?.status() ?? 0, newErrors: takeNewErrors() };
}

// Numbered snapshot of the interactive elements. Tags each element with data-shipcheck-n
// so a later act() can find the SAME element by number.
async function cmdSnapshot() {
  const data = await S.page.evaluate((sel) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const nameOf = (el) => (el.getAttribute('aria-label') || el.labels?.[0]?.textContent
      || el.value || el.textContent || el.getAttribute('placeholder') || el.getAttribute('name') || '').trim().slice(0, 80);
    document.querySelectorAll('[data-shipcheck-n]').forEach((el) => el.removeAttribute('data-shipcheck-n'));
    const els = [...document.querySelectorAll(sel)].filter(visible).slice(0, 120);
    const list = [];
    els.forEach((el, i) => {
      const n = i + 1;
      el.setAttribute('data-shipcheck-n', String(n));
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || '';
      const typeable = tag === 'textarea' || tag === 'select'
        || (tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'file', 'hidden'].includes(type));
      const secret = type === 'password' || /cc-?num|card.?number|cvc|cvv/i.test(el.getAttribute('name') || el.getAttribute('autocomplete') || '');
      list.push({ n, tag, role: el.getAttribute('role') || tag, name: nameOf(el), type: type || undefined, typeable: typeable && !secret, secret });
    });
    return { url: location.href, title: document.title || '', elements: list,
      text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2000) };
  }, CLICKABLE);
  return { url: data.url, title: data.title, elements: data.elements, textExcerpt: data.text, newErrors: takeNewErrors() };
}

async function cmdAct(action) {
  const before = S.page.url();
  const loc = (n) => S.page.locator(`[data-shipcheck-n="${n}"]`).first();
  try {
    if (action.action === 'goto') {
      await S.page.goto(action.url, { waitUntil: 'load' });
    } else if (action.action === 'click') {
      await loc(action.n).click({ timeout: S.limits.actionTimeoutMs });
    } else if (action.action === 'type') {
      await loc(action.n).fill('');
      await loc(action.n).type(String(action.text).slice(0, 200), { timeout: S.limits.actionTimeoutMs });
    } else if (action.action === 'select') {
      await loc(action.n).selectOption(String(action.value), { timeout: S.limits.actionTimeoutMs });
    }
    await S.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
  } catch (e) {
    S.errors.push(`act: ${String(e.message).split('\n')[0]}`);
  }
  const after = S.page.url();
  const newErrors = takeNewErrors();
  return { newUrl: after !== before ? after : null, nothingHappened: after === before && newErrors.length === 0, newErrors };
}

// Full deterministic check set for ONE page (the api de-duplicates by URL).
async function cmdAudit(url) {
  if (url && S.page.url() !== url) await cmdOpen(url);
  const pageUrl = S.page.url();
  const findings = [];
  const add = (checkId, evidence = {}) => findings.push({ checkId, target: pageUrl, evidence });
  const errBefore = S.errors.length;

  let status = 0; let timing = null; let textExcerpt = ''; let screenshot = null;
  try {
    const nav = await S.page.goto(pageUrl, { waitUntil: 'load' }).catch(() => null);
    status = nav?.status() ?? 0;
    await S.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    if (status >= 400) {
      add('http.error_status', { status });
      const shot = await S.page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
      return finish(shot);
    }
    const robotsHeader = nav?.headers()['x-robots-tag'] ?? '';
    if (/noindex/i.test(robotsHeader)) add('page.noindex', { header: robotsHeader });

    timing = await S.page.evaluate(() => new Promise((resolve) => {
      const nav = performance.getEntriesByType('navigation')[0];
      let lcp = null;
      try { new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
      setTimeout(() => resolve({ ttfbMs: nav ? Math.round(nav.responseStart) : null, domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null, loadMs: nav ? Math.round(nav.loadEventEnd) : null, lcpMs: lcp != null ? Math.round(lcp) : null }), 300);
    }));
    if (timing.ttfbMs != null && timing.ttfbMs > 800) add('perf.slow_ttfb', { ttfbMs: timing.ttfbMs });
    if (timing.lcpMs != null && timing.lcpMs > 2500) add('perf.slow_lcp', { lcpMs: timing.lcpMs });

    const seo = await S.page.evaluate(() => {
      const meta = (s) => document.querySelector(s)?.getAttribute('content')?.trim() || null;
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => { try { JSON.parse(s.textContent || ''); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message).slice(0, 120) }; } });
      const insecure = location.protocol === 'https:'
        ? [...document.querySelectorAll('img[src],script[src],iframe[src],link[rel="stylesheet"][href]')].map((el) => el.getAttribute('src') || el.getAttribute('href')).filter((u) => u && u.startsWith('http:')).slice(0, 10) : [];
      return { title: (document.title || '').trim(), description: meta('meta[name="description"]'), robots: meta('meta[name="robots"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.href || null, h1Count: document.querySelectorAll('h1').length,
        ogTitle: meta('meta[property="og:title"]'), ogImage: meta('meta[property="og:image"]'), lang: document.documentElement.getAttribute('lang'),
        viewport: meta('meta[name="viewport"]'), jsonLd, insecure, text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim() };
    });
    if (!seo.title) add('seo.title_missing'); else if (seo.title.length < 10 || seo.title.length > 60) add('seo.title_length', { length: seo.title.length });
    if (!seo.description) add('seo.description_missing'); else if (seo.description.length < 50 || seo.description.length > 160) add('seo.description_length', { length: seo.description.length });
    if (seo.robots && /noindex/i.test(seo.robots)) add('page.noindex', { robots: seo.robots });
    if (seo.h1Count === 0) add('seo.h1_missing');
    if (seo.h1Count > 1) add('seo.h1_multiple', { count: seo.h1Count });
    if (!seo.canonical) add('seo.canonical_missing'); else if (!S.inScope(seo.canonical)) add('seo.canonical_other_host', { canonical: seo.canonical });
    for (const j of seo.jsonLd) if (!j.ok) add('seo.jsonld_invalid', { error: j.error });
    if (!seo.ogTitle || !seo.ogImage) add('seo.og_missing', { ogTitle: Boolean(seo.ogTitle), ogImage: Boolean(seo.ogImage) });
    if (!seo.lang) add('seo.lang_missing');
    if (!seo.viewport) add('seo.viewport_missing');
    if (seo.insecure.length) add('security.mixed_content', { urls: seo.insecure });
    const injection = INJECTION_PATTERNS.map((re) => seo.text.match(re)?.[0]).find(Boolean);
    if (injection) add('security.prompt_injection_text', { match: injection.slice(0, 160) });
    textExcerpt = seo.text.slice(0, 3000);

    const shot = await S.page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
    screenshot = shot ? shot.toString('base64') : null;

    if (Date.now() < S.deadline) {
      try {
        const axe = await new AxeBuilder({ page: S.page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        for (const v of axe.violations) add(`a11y.${v.id}`, { impact: v.impact, help: v.help, nodes: v.nodes.length, selector: v.nodes[0]?.target?.join(' ') ?? null });
      } catch { emit({ type: 'warning', message: `Accessibility scan failed on ${pageUrl}` }); }
    }

    const anchors = await S.page.$$eval('a[href]', (els) => els.map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 80) })));
    const unique = new Map();
    for (const a of anchors) { const href = normalizeLink(a.href, pageUrl); if (href && S.inScope(href) && !unique.has(href)) unique.set(href, { href, text: a.text }); }
    const checked = await checkLinks([...unique.values()].slice(0, S.limits.maxLinksPerPage));
    for (const l of checked) if (l.status === 0 || l.status >= 400) add('links.broken', { link: l.href, status: l.status, text: l.text });
  } catch (err) {
    add('page.load_failed', { error: String(err?.message ?? err).split('\n')[0] });
  }
  const shot = screenshot ? null : await S.page.screenshot({ type: 'jpeg', quality: 60 }).catch(() => null);
  return finish(shot);

  function finish(shotBuf) {
    // Turn the page's console/js/network errors (added during this audit) into findings.
    const added = S.errors.slice(errBefore);
    let c = 0; let j = 0; let r = 0;
    for (const e of added) {
      if (e.startsWith('console:') && c++ < 5) add('console.error', { text: e.slice(9) });
      else if (e.startsWith('js:') && j++ < 5) add('js.exception', { text: e.slice(4) });
      else if ((e.startsWith('request:') || e.startsWith('http:')) && r++ < 10) add('network.failed_request', { text: e });
    }
    S.errMark = S.errors.length;
    return { url: pageUrl, finalUrl: S.page.url(), status, timing, findings, textExcerpt,
      screenshot: screenshot ?? (shotBuf ? shotBuf.toString('base64') : null), envSecretsCount: countSecretLikeEnv() };
  }
}

async function checkLink(href) {
  try {
    let res = await S.context.request.head(href, { timeout: 8000, maxRedirects: 5 });
    if (res.status() === 405 || res.status() === 501) res = await S.context.request.get(href, { timeout: 8000, maxRedirects: 5 });
    return res.status();
  } catch { return 0; }
}
async function checkLinks(links) {
  const queue = [...links]; const results = [];
  const worker = async () => { while (queue.length && Date.now() < S.deadline) { const l = queue.shift(); if (!S.linkCache.has(l.href)) S.linkCache.set(l.href, checkLink(l.href)); results.push({ ...l, status: await S.linkCache.get(l.href) }); } };
  await Promise.all(Array.from({ length: 6 }, worker));
  return results;
}

async function handle(msg) {
  switch (msg.cmd) {
    case 'discover': return { ok: true, result: await cmdDiscover(msg.startUrl) };
    case 'open':     return { ok: true, result: await cmdOpen(msg.url) };
    case 'snapshot': return { ok: true, result: await cmdSnapshot() };
    case 'act':      return { ok: true, result: await cmdAct(msg.action) };
    case 'audit':    return { ok: true, result: await cmdAudit(msg.url) };
    case 'close':    return { ok: true, result: { ok: true } };
    default:         return { ok: false, error: `unknown command: ${msg.cmd}` };
  }
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { continue; }
    if (msg.init) { await setup(msg); out({ ready: true }); continue; }
    try {
      const res = await handle(msg);
      out({ id: msg.id, ...res });
    } catch (err) {
      out({ id: msg.id, ok: false, error: String(err?.message ?? err).split('\n')[0] });
    }
    if (msg.cmd === 'close') break;
  }
  await S.browser?.close().catch(() => {});
}

main().catch((err) => { out({ fatal: String(err?.message ?? err).split('\n')[0], envSecretsCount: countSecretLikeEnv() }); process.exitCode = 1; });
