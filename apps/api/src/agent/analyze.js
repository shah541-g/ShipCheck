import { z } from 'zod';
import { config } from '../config.js';
import { llmJson } from '../llm/json.js';
import { ANALYZE_SYSTEM } from '../llm/prompts.js';

const AnalyzeSchema = z.object({
  findings: z.array(z.object({ id: z.string(), why: z.string(), fix: z.string() })).default([]),
  observations: z.array(z.object({ title: z.string(), detail: z.string() })).default([])
});

// Page content and evidence can contain text copied from the audited website.
// Keep the delimiters intact even if the site includes a fake closing tag.
const fence = (value) => String(value ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safeMessage = (error) => {
  let message = String(error?.message || error || 'AI error');
  if (config.llm.apiKey) message = message.split(config.llm.apiKey).join('[redacted]');
  return message.slice(0, 160);
};
const safeEmit = (emit, type, event) => { try { emit(type, event); } catch { /* telemetry must not interrupt fail-soft analysis */ } };

function ensureBuiltInGuidance(finding) {
  let usedFallback = false;
  if (!String(finding.why || '').trim()) {
    finding.why = 'This check found a potential issue that may affect visitors or how the page is understood. Review the measured evidence to confirm its impact.';
    usedFallback = true;
  }
  if (!String(finding.fix || '').trim()) {
    const subject = String(finding.title || finding.checkId || 'reported issue').replace(/[<>]/g, '').slice(0, 120);
    finding.fix = `Review the evidence for ${subject}, correct the underlying issue on this page, then rerun the audit to verify the fix.`;
    usedFallback = true;
  }
  if (usedFallback || typeof finding.aiWritten !== 'boolean') finding.aiWritten = false;
}

/**
 * Add plain-language explanations to measured findings, keeping each finding's
 * built-in why/fix if AI is unavailable. The optional emit/request hooks make
 * this usable by the pipeline and deterministic in unit tests.
 */
export async function analyzePages(job, pages, findings, { emit = () => {}, request, timeoutMs, aiStatus } = {}) {
  const observations = [];
  const vision = Boolean(config.llm.visionModel);
  const availablePages = Array.isArray(pages) ? pages : [];
  const measuredFindings = Array.isArray(findings) ? findings : [];
  let attempts = 0;
  let usefulOutputs = 0;

  for (const page of availablePages) {
    if (!page || typeof page.url !== 'string') continue;
    const pageFindings = measuredFindings.filter((finding) => finding.page === page.url).slice(0, 25);
    if (!pageFindings.length && !page.textExcerpt) continue;

    for (const finding of pageFindings) ensureBuiltInGuidance(finding);
    safeEmit(emit, 'progress', { message: `AI is reviewing ${page.url}`, data: { url: page.url } });
    const facts = pageFindings.map(({ id, checkId, title, evidence }) => ({ id, checkId, title, evidence }));
    const text = `Page: ${page.url}\nFindings (facts measured by code):\n<untrusted_findings_json>\n${fence(JSON.stringify(facts))}\n</untrusted_findings_json>\n\n<untrusted_page_text>\n${fence(page.textExcerpt).slice(0, 4000)}\n</untrusted_page_text>`;
    const user = vision && page.screenshot
      ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${page.screenshot}` } }]
      : text;

    attempts += 1;
    try {
      const result = await llmJson({
        system: ANALYZE_SYSTEM(vision),
        user,
        schema: AnalyzeSchema,
        model: vision ? config.llm.visionModel : config.llm.model,
        ...(timeoutMs ? { timeoutMs } : {}),
        ...(request ? { request } : {})
      });
      const byId = new Map(pageFindings.map((finding) => [finding.id, finding]));
      let pageHadUsefulOutput = false;
      for (const suggestion of result.findings) {
        const finding = byId.get(suggestion.id);
        const why = suggestion.why.trim();
        const fix = suggestion.fix.trim();
        if (!finding || !why || !fix) continue;
        finding.why = why.slice(0, 600);
        finding.fix = fix.slice(0, 600);
        finding.aiWritten = true;
        pageHadUsefulOutput = true;
      }
      for (const observation of result.observations.slice(0, 3)) {
        const title = observation.title.trim();
        const detail = observation.detail.trim();
        if (title && detail) {
          observations.push({ page: page.url, title: title.slice(0, 120), detail: detail.slice(0, 500) });
          pageHadUsefulOutput = true;
        }
      }
      if (pageHadUsefulOutput) usefulOutputs += 1;
    } catch (error) {
      safeEmit(emit, 'warning', {
        message: `AI review unavailable for ${page.url}; built-in guidance shown (${safeMessage(error)})`
      });
    }
  }

  // A valid JSON envelope with only blank/unknown content is not useful AI
  // analysis; reports must continue to describe the built-in guidance as fallback.
  if (aiStatus && attempts > 0) aiStatus.analysisAvailable = usefulOutputs > 0;
  return observations;
}
