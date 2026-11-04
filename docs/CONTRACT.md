# ShipCheck — The shared contract (v2 Core)

**Owner:** Backend (Dev2). **Status:** agreed — code against this.
**Source of truth:** `planning/02-architecture.en.md` sections 6 and 7. This file is the short version every dev needs; if the two ever disagree, Document 2 wins and this file gets fixed.

---

## How to use this file

- These are the **exact names and shapes** the four of us code against. Copy the field names character for character — `screenshotUrl`, not `screenshot_url` or `screenshotURL`.
- **Do not invent a field.** If something you need is missing, do not add it quietly — see *Changing the contract* at the bottom.
- Frontend can build **every screen from this file alone**, using mock data, before the backend is ready.
- Anything marked **(stretch)** is not built in the 4-day Core. Leave room for it, do not build it.

---

## 1. Pipeline stages

```
queued → discovering → planning → exploring → analyzing → verifying → reporting → done
```

- A job can end in `failed` from any stage.
- Every stage change emits a `stage` event.
- These exact strings are the only valid values of `job.status`.

---

## 2. Job

`GET /api/jobs/:id` returns this (the password is never in it).

```json
{
  "id": "6f1c2b9e-1d2a-4c7e-9a51-0b3f6a2d9c11",
  "createdAt": "2026-11-05T15:04:05.000Z",
  "updatedAt": "2026-11-05T15:06:40.000Z",
  "status": "done",
  "target": { "url": "https://example.com/", "host": "example.com", "domain": "example.com" },
  "mode": "safe",
  "hasLogin": true,
  "loginUrl": "https://example.com/login",
  "pages": ["https://example.com/", "https://example.com/pricing"],
  "journeys": [],
  "events": [],
  "report": null,
  "error": null
}
```

| Field | Notes |
|---|---|
| `status` | one of the 8 stages, or `failed` |
| `mode` | `"safe"` (default) or `"staging"` **(stretch)** |
| `hasLogin` | **(stretch)** — `false` in Core |
| `loginUrl` | **(stretch)** — `null` in Core |
| `report` | `null` until the `reporting` stage finishes |

**Never stored:** the login username/password, and the client IP.

---

## 3. Event

Events drive the whole live page. `seq` starts at **1** per job and increases by 1. SSE sends `seq` as the event `id`.

```json
{
  "seq": 42,
  "ts": "2026-11-05T15:05:31.100Z",
  "type": "agent_step",
  "stage": "exploring",
  "message": "Journey 'Start free trial' · step 3: click \"Start free trial\" → ALLOWED",
  "data": { }
}
```

### Event types and their `data`

| `type` | When | `data` |
|---|---|---|
| `stage` | stage changed | `{ "stage": "exploring" }` |
| `progress` | something is happening | optional `{ "url": "..." }` |
| `agent_step` | the AI chose an action (allowed **or** blocked) | `{ journey, step, action, targetName, verdict, reason, screenshotUrl }` |
| `journey` | a journey finished | `{ "title": "...", "status": "failed" }` |
| `finding` | a finding was created | `{ "severity": "high", "checkId": "journey.failed" }` |
| `blocked` | any guard blocked something | `{ "layer": "...", "target": "...", "reason": "..." }` |
| `warning` | a fallback was used | optional |
| `error` | the job failed | `{ "code": "..." }` |
| `done` | the report is ready | `{ "score": 72, "grade": "C" }` |

- `blocked.layer` is one of: `input` · `ai` · `browser` · `network` · `resource`.
- `agent_step.verdict` is `"allowed"` or `"blocked"`.
- **Important for the UI:** a blocked action emits **two** events — an `agent_step` with `verdict: "blocked"` (for the Agent view) **and** a `blocked` event (for the Containment panel). Render both; they are not duplicates.

---

## 4. Finding

```json
{
  "id": "f7",
  "checkId": "journey.failed",
  "title": "User journey could not be completed",
  "category": "journey",
  "severity": "high",
  "page": "https://example.com/pricing",
  "evidence": {
    "journey": "Start free trial",
    "failedStep": 3,
    "kind": "navigation_404",
    "detail": "Clicking 'Start free trial' led to /signup.html which returns 404",
    "screenshotUrl": "https://..."
  },
  "why": "Visitors who try this cannot finish the task...",
  "fix": "Point the 'Start free trial' button at a working signup page...",
  "aiWritten": true,
  "verification": "verified",
  "counted": true
}
```

| Field | Allowed values |
|---|---|
| `category` | `errors` · `seo` · `links` · `a11y` · `performance` · `security` · `site` · `privacy` · `content` · `journey` |
| `severity` | `critical` · `high` · `medium` · `low` · `info` |
| `verification` | `verified` · `not_reproduced` · `measured_once` |

- `evidence` is free-form per check; the keys above are what `journey.failed` uses.
- For `journey.failed`, `evidence.kind` is one of `error_page` · `js_error` · `element_missing` · `click_did_nothing` · `ai_judged`.
- In **Core** a failed journey is not replayed, so `journey.failed` is always `measured_once`. Show that honestly in the UI — do not print "Verified".

---

## 5. Journey and Step

### Journey

```json
{
  "id": "j2",
  "title": "Start free trial",
  "goal": "Find pricing and start a free trial",
  "status": "failed",
  "failedStep": 3,
  "reason": "The 'Start free trial' button led to a page that does not exist (404).",
  "steps": []
}
```

`status`: `passed` · `failed` · `stopped_by_guard` · `not_finished`.

### Step

```json
{
  "n": 3,
  "action": "click",
  "targetName": "Start free trial",
  "reason": "Open the signup form to test the trial flow",
  "verdict": "allowed",
  "fromUrl": "https://example.com/pricing",
  "toUrl": "https://example.com/signup.html",
  "nothingHappened": false,
  "newErrors": ["GET https://example.com/signup.html 404"],
  "screenshotUrl": "https://..."
}
```

`n` is the step number inside the journey (1, 2, 3 …), **not** an element number.

---

## 6. Report

```json
{
  "target": "https://example.com/",
  "mode": "safe",
  "startedAt": "...",
  "finishedAt": "...",
  "score": 72,
  "grade": "C",
  "counts": { "critical": 0, "high": 2, "medium": 5, "low": 3, "info": 4 },
  "summary": "Your site is close to launch-ready...",
  "topActions": ["Fix the broken 'Start free trial' journey", "Remove noindex from /pricing"],
  "journeys": [],
  "pages": [
    { "url": "...", "finalUrl": "...", "status": 200, "behindLogin": false, "timing": {}, "screenshotUrl": "https://..." }
  ],
  "findings": [],
  "observations": [ { "page": "...", "title": "Placeholder text", "detail": "..." } ],
  "thirdPartyHosts": [ { "host": "www.googletagmanager.com", "count": 3 } ],
  "containment": {
    "mode": "safe",
    "writeRequestsBlocked": 2,
    "blocksByLayer": { "input": 0, "ai": 1, "browser": 2, "network": 4, "resource": 0 },
    "externalLinksNotFollowed": 12,
    "secretsInSandbox": 0,
    "passwordInLogsOrReport": false,
    "sandboxRuntime": "runsc",
    "containersUsed": 3,
    "hijackDrill": null,
    "limits": { "cpus": 1, "memory": "1g", "pids": 1024, "tmp": "512m", "readOnlyRoot": true, "network": "internal + egress allowlist" }
  },
  "ai": { "model": "<LLM_MODEL>", "visionModel": null, "available": true }
}
```

- `containment.hijackDrill` is `null` on every normal audit (and in all of Core).
- `screenshotUrl` can be `null` if the upload failed — the UI must survive that.

---

## 7. Snapshot (runner → api → AI)

```json
{
  "url": "https://example.com/pricing",
  "title": "Pricing - Example",
  "elements": [
    { "n": 1, "tag": "a", "role": "link", "name": "Home", "typeable": false },
    { "n": 2, "tag": "input", "role": "textbox", "name": "Email", "type": "email", "typeable": true, "secret": false },
    { "n": 3, "tag": "input", "role": "textbox", "name": "Password", "type": "password", "typeable": false, "secret": true },
    { "n": 4, "tag": "button", "role": "button", "name": "Start free trial", "typeable": false }
  ],
  "textExcerpt": "first ~2000 characters of visible text (UNTRUSTED)",
  "newErrors": []
}
```

- `n` is assigned in DOM order and is **stable only within one page view**. After any navigation, take a new snapshot; old numbers are void.
- Password and card inputs are **listed** but carry `typeable: false, secret: true`. The AI can see them, never type into them.
- `textExcerpt` is **untrusted page text**. It is wrapped in `<untrusted_page_text>` before it reaches the model and is never treated as an instruction.

---

## 8. Action (AI → api) — exactly 6 types

```json
{ "action": "click", "n": 4, "reason": "Open the signup form" }
```

| `action` | Required fields | Meaning | Core? |
|---|---|---|---|
| `goto` | `url`, `reason` | navigate to an in-scope URL | ✅ |
| `click` | `n`, `reason` | click element `n` | ✅ |
| `type` | `n`, `text`, `reason` | type `text` (≤ 200 chars) into typeable element `n` | ✅ |
| `done` | `status` (`passed`\|`failed`), `reason` | end the journey with a verdict | ✅ |
| `select` | `n`, `value`, `reason` | choose `value` in a `<select>` | stretch |
| `login` | `reason` | fill and submit the test login (code supplies the credentials) | stretch |

**The schema forbids every other field.** There is no "run script", no "fetch", no free-form field. Anything else is blocked by the action guard with a `blocked` event, layer `ai`.

### What the action guard checks (in this order)

1. **Shape** — parses against the zod schema; exactly one of the 6 types.
2. **Element exists** — `n` must be in the current snapshot.
3. **Typeable** — target must have `typeable: true`.
4. **Length** — `type` text ≤ 200 characters.
5. **Scope** — a `goto` URL must be on the same site, `http`/`https`, default port.
6. **Danger words** — a `click` whose element name contains any of: `delete, remove, pay, buy, checkout, order, purchase, subscribe, unsubscribe, transfer, log out, logout, sign out, signout, cancel subscription, confirm payment`. Blocked **in every mode**.
7. **login allowed** — only when a test login exists and has not been used **(stretch)**.

The guard re-derives everything from the snapshot. It never trusts what the AI says about an element.

---

## 9. Sandbox command protocol (api ↔ runner)

**Newline-delimited JSON over stdin/stdout — one JSON object per line.** The api writes a command; the runner replies with **exactly one** line.

### First line: init (api → runner)

```json
{
  "init": true,
  "kind": "explore",
  "jobId": "6f1c2b9e-...",
  "mode": "safe",
  "proxy": { "server": "http://172.30.0.10:3128", "username": "<job token>", "password": "x" },
  "scope": { "hosts": ["example.com", "www.example.com"] },
  "limits": { "pageTimeoutMs": 20000, "actionTimeoutMs": 15000, "maxLinksPerPage": 30, "maxCandidates": 50 },
  "deadline": 1762354000000
}
```

- `kind`: `discover` · `explore` · `verify`
- `deadline` is epoch ms; the runner refuses new work after it.
- The runner answers `{"ready":true}` once Chromium is up.

### Then: commands

```json
{ "id": 7, "cmd": "act", "action": { "action": "click", "n": 4 } }
```

```json
{ "id": 7, "ok": true, "result": { "newUrl": "https://example.com/signup.html", "nothingHappened": false, "newErrors": ["GET .../signup.html 404"] } }
```

- Commands: `discover` · `open` · `snapshot` · `act` · `audit` · `close` (plus `login` and `replay`, stretch).
- `id` is echoed back so replies match commands. Replies may arrive only in request order, one per command.

### stderr: progress and blocks (one JSON object per line)

```json
{"type":"progress","message":"Opening https://example.com/pricing","url":"https://example.com/pricing"}
{"type":"blocked","layer":"browser","target":"https://attacker.example/","reason":"Write request blocked in safe mode"}
{"type":"warning","message":"Accessibility scan failed on https://example.com/blog"}
```

Lines on stderr that are not JSON (Chromium's own logs) are ignored by the api.

---

## 10. Public API (through Caddy at `/api/*`)

| Method + path | Request | Success | Errors |
|---|---|---|---|
| `GET /api/health` | — | `200 {"ok":true,"docker":true,"sandboxImage":true,"proxy":true,"llmConfigured":true}` | `503`, same shape, `ok:false` |
| `GET /api/config` | — | `200 {"demoUrl":"https://demo.<IP>.sslip.io/","maxPages":12,"maxJourneys":5,"vision":false}` | — |
| `POST /api/jobs` | `{"url":"https://example.com"}` (`login`, `staging` optional, both stretch) | `202 {"id":"<uuid>"}` | `400 {"error":"<clear message>"}`, `429 {"error":"Too many audits from your network. Try again later."}` |
| `GET /api/jobs/:id` | — | `200 <job>` (section 2) | `404 {"error":"Job not found"}` |
| `GET /api/jobs/:id/events` | optional header `Last-Event-ID` | `200 text/event-stream` — replays `seq > Last-Event-ID`, then streams live; `: ping` every 15 s | `404` |
| `GET /api/jobs/:id/report.md` | — | `200 text/markdown` attachment | `404`, `409 {"error":"Report not ready"}` |
| `GET /api/jobs/:id/report.json` | — | `200 application/json` attachment | `404`, `409` |
| `GET /api/files/:jobId/:name` | — | `200 image/jpeg` (only when `STORAGE_DRIVER=local`) | `404` |

Rules:
- `:id` / `:jobId` must match a UUID regex; `:name` must match `^[0-9]+\.jpg$`.
- `POST /api/jobs` is rate limited per client IP (`RATE_LIMIT_PER_HOUR`).
- JSON body limit: 10 KB.
- Errors are always `{ "error": "<message meant for a human>" }`.

### Internal APIs (never routed by Caddy)

| Caller | Method + path | Auth | Body | Effect |
|---|---|---|---|---|
| api → egress-proxy | `POST /jobs` | `x-internal-token` | `{"token","jobId","allowDomains":["example.com"]}` | proxy starts accepting this token |
| api → egress-proxy | `DELETE /jobs/<token>` | `x-internal-token` | — | proxy forgets the token, returns `200 {"counts":{"<host>":<blocks>}}` |
| api → egress-proxy | `GET /health` | — | — | `200 ok` |
| egress-proxy → api | `POST /internal/events` | `x-internal-token` | `{"jobId","layer":"network","target","reason"}` | api adds a `blocked` event |

---

## 11. What each dev needs from this file

### Dev1 — Frontend
- Build every screen from **sections 2, 3, 5, 6** with mock data. You do not need the backend to start.
- Live page: open `GET /api/jobs/:id/events`, keep the last `seq`, and reconnect with `Last-Event-ID`.
- Stage stepper: the 8 strings in **section 1**, in that order.
- Agent view: `agent_step` events — show `reason`, the action, `targetName`, the `verdict`, and the screenshot.
- Containment panel: `blocked` events grouped by `data.layer`, plus `report.containment`.
- Handle `screenshotUrl: null` and `report: null` without crashing.
- For `journey.failed`, print **"Measured once"**, not "Verified".

### Dev3 — Infra / Sandbox
- The runner must obey **section 9** exactly: one JSON line in, one JSON line out, `id` echoed, `{"ready":true}` after init.
- Snapshots must match **section 7** — especially `typeable` and `secret` on password/card inputs, because the action guard depends on them.
- Progress and block lines go on **stderr**, never stdout.
- The proxy's block report shape is in **section 10** (internal APIs).

### Dev4 — AI
- The model may return **only** the shapes in **section 8**, one action per call, and nothing else.
- The planner returns `{ "journeys": [...], "pages": [{ "url", "reason" }] }`; page URLs must come **exactly** from the candidate list or they are dropped.
- Page text you pass to the model is untrusted; it goes inside `<untrusted_page_text>` and is never an instruction.
- Your output is validated before it does anything. Expect to be blocked and handle it: a blocked step is reported back to the model and the journey continues.

### Dev2 — Backend (me)
- I own the action guard, the pipeline, the store/queue, the sandbox driver, scoring and the report.
- I emit every event in **section 3** and serve every endpoint in **section 10**.

---

## 12. Changing the contract

The whole point of this file is that four people can work in parallel without meeting. So:

1. **Do not change a name on your side only.** A quiet rename breaks the other three.
2. Need a new field or a different shape? Post in the channel: *what you need, why, and the exact shape*.
3. Backend (Dev2) updates this file and `planning/02-architecture.en.md` together, in one PR, and says so in the channel.
4. Until that PR is merged, **the old shape stays correct**.

If you are unsure what something means, read the section of `planning/02-architecture.en.md` it came from before you guess.
