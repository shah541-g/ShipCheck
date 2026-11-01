---
trigger: always_on
---

# Project: ShipCheck (what we are building)

> **Decision:** the team is building **ShipCheck** for Challenge 1, Pattern B (sandboxed browser use).
>
> **Source of truth for the build:** [03-build-steps.en.md](../../planning/03-build-steps.en.md) ("v2 Core"). It is about 4,500 lines, so **read only the phase or step you need** (find it by its heading, e.g. "Step 4.2"). The other two documents in the set:
> - Document 1, agent definition: [01-agent-definition.en.md](../../planning/01-agent-definition.en.md).
> - Document 2, architecture (`02-architecture.en.md`): **not in this repo yet**.
>
> Where this file and the build steps disagree, the build steps win.

## How to work on this project

- **Implement one build step at a time, exactly as written.** Every step ends with a **✅ Check**; do not start the next step until it passes. Code blocks marked with a file path are complete files.
- **No application code before kickoff** (Tue 3 Nov). The repo history must start during the event. Phase 0 is setup and learning only.
- **`SECURITY-TEST` placeholders are not written from the build steps.** The demo-site traps (hidden prompt-injection note, exfiltration script) and the hijack-drill attack list come from a separate **security-test spec** after kickoff. Leave the placeholders as they are; do not invent attack content.
- **Core first, Stretch only if ahead.** Core must be deployed by Fri 6 Nov night. Stretch items (S1 test login, S2 staging mode, S3 journey replay, S4 hijack drill, S5 visual check, S6 select) come only after Core is tested.
- **Dev machine:** Windows; commands run in **Git Bash** unless a step says PowerShell. Project folder: **this `ShipCheck` folder** (`D:\Notes\Hackathon\ShipCheck`; Git Bash path `/d/Notes/Hackathon/ShipCheck`). Wherever the build steps say `D:\E\Projects\shipcheck` or `/d/E/Projects/shipcheck`, use this folder instead. In Step 1.9, initialize the GitHub repo here (clone it into this folder, or `git init` and add the remote) instead of cloning into `D:\E\Projects`. The planning documents are in `planning/`; the application code goes next to it (`apps/`, `sandbox/`, `demo-site/`, `docs/`, …). VM commands run over SSH as user `deploy`.

## Architecture (Core)

```
Browser ──HTTPS──> Caddy ──> web  (Next.js, :3000)
                        └──> api  (Express, :4000; /api/*; SSE with flush_interval -1)
api ──docker.sock──> one fresh sandbox container per stage (discover / explore / verify)
                     Playwright Chromium "command server": one JSON command per stdin line,
                     one JSON reply per stdout line; progress/blocked events on stderr
sandbox ──(internal network shipcheck-sandbox, 172.30.0.0/24, no internet)──>
        egress-proxy at FIXED IP 172.30.0.10:3128 (per-job token + domain allowlist)
egress-proxy admin :8080 (INTERNAL_TOKEN) ──reports blocks──> api /internal/events
api ──> Vultr Serverless Inference (all AI calls)   api ──> Vultr Object Storage (screenshots)
```

**Pipeline:** discover → plan (up to 5 journeys, 12 pages) → **explore** (the AI drives: observe → decide → guard → act, up to 40 actions, 12 per journey) → analyze → verify (Prove-It in a fresh sandbox) → report (score and grade).

**Runner commands:** `init`, `discover`, `open`, `snapshot`, `act` (`goto` / `click` / `type` / `select`), `audit`, `close` (`login` and `replay` are Stretch).

## Repo layout

| Path | What |
|---|---|
| `apps/api/` | Express orchestrator: `src/config.js`, `src/security/{policy,actionGuard}.js`, `src/jobs/{events,store,queue}.js`, `src/sandbox/{proxyClient,runSandbox}.js`, `src/llm/{client,json,prompts}.js`, `src/agent/{rules,journeys,findings,plan,explorer,verify,scoring,analyze,report,markdown,pipeline}.js`, `src/storage/{local,s3,index}.js`, `src/routes/{meta,jobs,files,internal}.js`, `src/server.js`; `scripts/{llm-smoke,containment-check,sandbox-try}.js`; `test/` |
| `apps/egress-proxy/` | `src/{cdn-hosts,allowlist,ipguard,proxy}.js`, `test/` |
| `apps/web/` | Next.js App Router: `app/page.js`, `app/jobs/[id]/page.js`, `app/how-it-works/page.js`; components `UrlForm`, `JobLive`, `StageStepper`, `AgentView`, `Timeline`, `ContainmentPanel`, `ScoreCard`, `JourneyCard`, `FindingCard`, `Report` |
| `sandbox/` | `runner.js` and a `Dockerfile` (`FROM mcr.microsoft.com/playwright:v<PW>-noble`, user `pwuser`) |
| `demo-site/` | Acme Rockets demo pages with planted problems (broken "Start free trial" journey, broken contact form, noindex, JS errors, …) |
| root | `docker-compose.yml`, `docker-compose.dev.yml`, `Caddyfile`, `.env.example`, `README.md`, `docs/architecture.png`, MIT `LICENSE` |

## Stack (pinned choices)

- Node.js 24 LTS, ES modules everywhere. Express, zod, `openai` (pointed at Vultr), tldts, express-rate-limit, `@aws-sdk/client-s3`. Tests use `node --test`.
- **Playwright: an exact version (`--save-exact`, no `^`), equal to the Docker image tag.**
- Caddy 2 with automatic HTTPS on `app.<IP>.sslip.io` / `demo.<IP>.sslip.io`. Fallback: DuckDNS subdomains.
- Storage: JSON job files on a Docker volume, plus Vultr Object Storage for screenshots (`STORAGE_DRIVER=s3`; `local` in dev).

## Safety layers (where they live)

| Layer | Implemented in |
|---|---|
| L1 Input guard | `apps/api/src/security/policy.js` (`normalizeTarget`, `scopeHosts`) |
| L2 Action guard | `apps/api/src/security/actionGuard.js` (6 action types, zod schema, danger words, scope, budgets, loop rule) |
| L3 Browser guard | `sandbox/runner.js` (`guardContext`: off-site requests and safe-mode writes aborted; dialogs dismissed; service workers blocked) |
| L4 Network guard | `apps/egress-proxy/` + the `internal: true` sandbox network |
| L5 Secret guard | `apps/api/src/sandbox/runSandbox.js`: **no `-e`, no `-v`, no socket** in `docker run`; `envSecretsCount` reported |
| L6 Resource guard | `runSandbox.js` flags: `--memory 1g --memory-swap 1g --cpus 1 --pids-limit 1024 --read-only --tmpfs /tmp --shm-size 512m --cap-drop ALL --security-opt no-new-privileges --runtime runsc` |

## Hard rules (never break these)

- Never add `-e`, `-v` or the Docker socket to the sandbox `docker run`. Only the **api** container mounts `docker.sock`.
- `SANDBOX_PROXY_URL` is an **IP** (`http://172.30.0.10:3128`), never a hostname: under gVisor a sandbox cannot use Docker's internal DNS.
- Keep `flush_interval -1` and no `encode` in Caddy's `/api/*` block, or Server-Sent Events arrive all at once.
- Only Caddy publishes ports (80, 443). The `/internal/*` routes are never exposed through Caddy.
- `.env` files are never committed; the VM `.env` is `chmod 600`.
- Every AI call goes to Vultr Serverless Inference in the final build (`LLM_BASE_URL=https://api.vultrinference.com/v1`). Practice keys (Gemini, Groq) are for before kickoff only.

## Cut order if behind (never cut the proxy, sandbox limits, demo site, action guard or deterministic checks)

1. Visual check (already Stretch).
2. `MAX_JOURNEYS=3`, 24 actions.
3. gVisor → `SANDBOX_RUNTIME=runc` (all other limits stay).
4. The "How it works" page.
5. Object Storage → `STORAGE_DRIVER=local` (and remove it from "Vultr services used").

## Schedule and team (Pakistan time)

| When | Phases | Goal |
|---|---|---|
| Before kickoff | 0 | Enrolled, tools installed, accounts, SSH key, images pulled |
| Tue 3 Nov (kickoff night) | 1 | Credits, firewall, VM, Docker, **gVisor checkpoint**, inference key and model choice, Object Storage, repo skeleton, demo site live over HTTPS |
| Wed 4 Nov | 2–3 | Sandbox command server, egress proxy, containment check (7 × PASS) |
| Thu 5 Nov | 4–5 | API core and the agent pipeline; full jobs from `curl` |
| Fri 6 Nov | 6–7 | Web UI, **production deploy: Core done** |
| Sat 7 Nov (buffer) | 8–10 | End-to-end tests, containment proof, README |
| Sun 8 Nov | 11 | Bug fixes and submission material only; **submit by 18:00 PKT** |

**Dates to watch:** the build steps say kickoff is 20:00 PKT. The event page ([hackathon.md](hackathon.md)) says kickoff is **9:00 PM PKT** and submissions close **Mon 9 Nov, 4:00 AM PKT**. Use the event page for official times; the team's 18:00 internal deadline is earlier than both.

**Team:**
- **Dev1 (Frontend):** web app, demo site, README, video, slides.
- **Dev2 (Backend):** API, job store and queue, pipeline, action guard, scoring, report, end-to-end tests.
- **Dev3 (Infra/Sandbox):** VM, Docker, gVisor, runner, egress proxy, deploy.
- **Dev4 (AI):** LLM client, plan, explorer loop, analyze, prompts, fallbacks.

**Critical path:** the sandbox runner (Phase 2) and the explorer loop (Step 5.3).

## Vultr services used (for the README)

1. Cloud Compute (Ubuntu 24.04, 2 vCPU / 4 GB + 2 GB swap): web, api, egress proxy, sandboxes.
2. Serverless Inference: every AI call.
3. Object Storage: screenshots.
4. Firewall: 22 (admin IP only), 80, 443.

## Open items

- **Pattern B "human approval before final actions":** Core runs in safe mode and never submits forms, so there is no final action to approve. Say this in the README. If Stretch S2 (staging mode) is built, add an Approve / Reject gate before any form submission.
- **Vision model:** decided at Step 1.12 (`LLM_VISION_MODEL`); the visual check is Stretch S5.
