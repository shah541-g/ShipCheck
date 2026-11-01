---
name: shipcheck-submission
description: "Prepare ShipCheck's hackathon submission: production end-to-end test table (Phase 8), the README structure with the containment table and the Vultr services section (Phase 10), the 2-3 minute demo video script, the 8 slides, the cover image, the lablab.ai submission texts and tags, and the final pre-submit checklist (Phase 11, submit by 18:00 PKT Sun 8 Nov). Use when writing the README, planning or scripting the video, making slides, filling the lablab.ai form or running final release checks."
---

# ShipCheck: Test, Document, Submit

Full text: [03-build-steps.en.md](../../../planning/03-build-steps.en.md) (Phases 8, 10 and 11). The official requirements are in [hackathon.md](../../context/hackathon.md).

## Phase 8: end-to-end tests in production (Sat 7 Nov)

Raise `RATE_LIMIT_PER_HOUR=100` while testing; restore it to 5 for row 12.

| # | Test | Expected |
|---|---|---|
| 1 | Demo site audit | ≥ 10 findings; **Start free trial** journey Failed; red `BLOCKED (network): attacker.example`; `Secrets inside sandbox: 0`; runtime `runsc`; Agent view shows ALLOWED / BLOCKED steps |
| 2 | 3 real public sites (small business, blog, docs) | Each finishes; reports make sense |
| 3 | A non-existent domain | "Could not open the site" |
| 4 | `http://localhost`, `http://169.254.169.254`, `https://example.com:8443` | Clear 400 messages |
| 5–6 | 2 audits at once, then 3 at once | All finish; the third waits in the queue ("position 1") |
| 7 | Share link in a private window | The report loads |
| 8 | Download Markdown and JSON | Both open; the Markdown has "User journeys" |
| 9 | 375 px phone width | Readable; no horizontal scroll |
| 10 | Safe-mode writes in the api logs | Only `BLOCKED (browser): ... write request`; no POST left the sandbox |
| 11 | `LLM_API_KEY=wrong` (fail-soft) | A report is still produced; journeys "not run" |
| 12 | 6 rapid POSTs to `/api/jobs` from the VM | Five `400`, then `429` |
| 13 | `docker compose restart api` mid-audit | That job says the server restarted; new audits work |

## Phase 10: README sections (required by the brief)

1. Title, one-line pitch, "Built for the Vultr Agent Rush Hackathon (Challenge 1: Blast Radius Zero)", and links: live demo, video, slides.
2. **What it does**: discover → plan journeys → drive the browser action by action → audit → explain → re-verify in a clean sandbox.
3. **Why it is safe**: the L1–L6 table, plus the 7 PASS lines from the production containment check.
4. **Architecture**: `docs/architecture.png` and one paragraph.
5. **Vultr services used**: Cloud Compute, Serverless Inference (name the model), Object Storage, Firewall. **Required by the brief.**
6. **Run it yourself**: clone, `.env`, build the sandbox image, `docker compose up -d --build`.
7. **Tests**: `npm test` in api and egress-proxy, plus the containment check.
8. **Known limitations**: including that Core never submits forms, so the Pattern B approval step applies only in staging mode (Stretch).
9. **License**: MIT.

Final repo checks: MIT `LICENSE`; the diagram renders; the repo is **public**; a stranger could follow the README.

## Phase 11: Sun 8 Nov, submit by 18:00 PKT

**Feature freeze from Sunday morning:** bug fixes and submission material only.

**Video (2–3 min, OBS, 1080p, YouTube Unlisted):**

| Time | Screen | Point |
|---|---|---|
| 0:00–0:10 | Landing | Hook: browser agents can be hijacked by one hidden line; ShipCheck can't |
| 0:10–0:30 | Landing cards | Every launch needs testing; the agent clicks through real journeys |
| 0:30–1:30 | **Try the demo site**, Agent view | The AI states its reason → the guard says ALLOWED / BLOCKED; "Start free trial" leads to a 404 (a link checker would miss it); **red BLOCKED (network): attacker.example** = the containment moment |
| 1:30–2:00 | Report | Score, summary, failed journey with screenshots, Verified badges, the prompt injection reported rather than obeyed |
| 2:00–2:30 | Architecture + containment-check screenshot | 6 layers, gVisor, egress proxy, no secrets; the 4 Vultr services |

**Slides (8, exported as PDF):** Title · Problem · Solution · Demo (failed journey + red BLOCKED) · Containment (6 layers + check output) · Architecture (+ 4 Vultr services) · Business value (agencies, SEO, QA, founders) · What's next (Stretch items as the roadmap) + links.

**Cover image:** 1920×1080; name, tagline, and a cropped Agent view showing the red BLOCKED panel.

**lablab.ai texts:**
- **Title:** ShipCheck: the pre-launch website tester that can't be hijacked
- **Short description:** A sandboxed AI agent that tests your website before launch. It clicks through real user journeys and audits every page (broken flows, errors, SEO, accessibility, prompt injection), and every action is contained on Vultr.
- **Long description:** problem → pipeline → 6 layers → the containment moment → Vultr services → business value (reuse the README).
- **Tags:** AI Agents, Vultr, Sandboxing, Security, Prompt Injection, Web QA, SEO, Accessibility, Playwright, Next.js
- **Links:** demo URL, public repo, video, slides.

**Final pre-submit checklist:**
- The public URL works in a private window, and the demo audit finishes.
- The repo is public, the README is complete, the license is MIT.
- The video link works and **shows a containment moment** (required for Challenge 1).
- The slides PDF opens.
- Every member is on the lablab team.
- Every form field is filled.

Submit, then screenshot the confirmation.
