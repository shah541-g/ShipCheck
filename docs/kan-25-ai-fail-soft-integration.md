# KAN-25 AI fail-soft integration note

This note records the AI-side integration point for KAN-25 while the shared report builder and job pipeline are absent from this checkout. It is a proposal for Dev2 to integrate, not a change to `docs/CONTRACT.md` or the public API contract.

## Existing AI-side behavior

- `agent/plan.js` returns no journeys when planning fails, emits a warning, and still selects the home page plus shortest discovered pages. Its internal `ai` metadata records planning availability and `journeysStatus: "not_run"`.
- `agent/explorer.js` ends a journey with the documented `not_finished` status when an action decision fails, emits a warning, and continues the remaining page audits. Its internal `ai` metadata reports `run`, `partially_run`, or `not_run` without changing the shared `Journey.status` enum.
- `agent/analyze.js` only explains findings already measured by code. It retains the finding's built-in `why` and `fix` if the provider fails, the response is malformed, or the returned explanation is empty. Only a non-empty explanation for a known finding ID can set `aiWritten: true`; observations are omitted on failed calls.
- `agent/failSoft.js` supplies deterministic summary and top-action fields when the summary model call is unavailable. The helper returns the existing report fields and does not add a field to `report.ai`.
- `llm/json.js` bounds each provider call, aborts a timed-out request, retries malformed/schema-invalid JSON once, and does not retry transport errors.

## Dev2 pipeline wiring

The documented D3 order is: plan → explore → build measured findings from rules → analyze → verify → report. The pipeline should:

1. Pass the planner result into the explorer and keep its fallback `pages` even when `journeys` is empty.
2. Pass rule-populated findings to `analyzePages(job, pages, findings, { emit, aiStatus })`. The rule module remains the source of concrete built-in explanations and fixes.
3. Merge the returned observations after analysis. A failed or empty analysis reply must not discard measured findings or their built-in guidance.
4. On summary generation failure, use `buildFailSoftReportFields(...)` or equivalent template logic. Set the existing `report.ai.available` according to the D3 report rule: summary generation succeeded or at least one finding has `aiWritten: true`.
5. Keep journey objects within the existing statuses in `docs/CONTRACT.md`. Use planner/explorer internal metadata to show “Journeys were not run” when appropriate; do not introduce a `not_run` `Journey.status` value.

## Missing integration and contract owner

At the time of this change, this checkout has no `agent/report.js`, `agent/pipeline.js`, rules/findings/scoring modules, job store, or API routes. Therefore the helper is not an end-to-end report generator, and these tests do not establish that an API job reaches a completed report.

The shared report contract currently defines `report.ai` as `{ model, visionModel, available }`. No new public field is proposed in code. If Dev2 decides the frontend needs an explicit journey-run state in the report, Dev2 must post the exact field and update `docs/CONTRACT.md` and `planning/02-architecture.en.md` together in one PR, as required by the contract's “Changing the contract” section.
