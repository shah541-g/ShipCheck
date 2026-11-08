# Slides — content for Gamma

Paste the block below into Gamma (**Create → Paste in text**), choose a dark, technical
theme and let it lay the slides out. Eight slides, exported as PDF for the submission.

The screenshot notes in italics are instructions for you, not slide text — delete them in
Gamma once the image is placed.

---

# ShipCheck

## The pre-launch website tester that can't be hijacked

A sandboxed AI agent that clicks through your site before your users do.

Built for the Vultr Agent Rush Hackathon — Challenge 1: Blast Radius Zero

---

# The problem

Give an AI agent a browser and it becomes the most dangerous user you have.

- It reads the page — and a page can tell it what to do
- One hidden line of text can redirect it to an attacker's server
- It can click Delete, Pay or Submit and mean it
- Teams want agents to test their sites, and can't risk letting one loose

Meanwhile launches still ship with dead buttons, broken journeys and missing metadata,
because nobody clicked through every flow.

---

# ShipCheck

An agent that tests a website, and a cage it cannot get out of.

**Discover** the pages → **Plan** real user journeys → **Explore** by driving a browser
one approved action at a time → **Analyze** every page → **Prove It** in a second clean
sandbox → **Report** with a score, evidence and fixes.

Six action types exist. Nothing else is possible.
Every action is approved by code before it runs — not by the model.

---

# It finds what a linter can't

*Screenshot: the failed pricing journey and its evidence image*

**A broken journey.** The agent clicked "Start free trial" and reached a dead end. The
button is JavaScript with no href — a link checker would never have seen it.

**A prompt injection, reported instead of obeyed.** The page carried hidden text telling
AI agents to export the customer list to `attacker.example`. ShipCheck filed it as a
high-severity finding and carried on.

**And it checks itself.** Every finding is re-run in a second clean sandbox. Only what
reproduces is marked **Verified**.

---

# Blast radius: zero

*Screenshot: docs/containment-check.png*

| Layer | What it stops |
|---|---|
| L1 Input guard | No localhost, private IPs, odd ports, credentials in URLs |
| L2 Action guard | 6 action types, must exist on the page, must stay in scope, never a Delete/Pay button |
| L3 Browser guard | No navigation off the site, no writes leave the sandbox, no service workers |
| L4 Network guard | No direct internet — an egress proxy with a per-job allowlist |
| L5 Secret guard | Zero secrets in the sandbox. The AI key never enters it |
| L6 Resource guard | Fresh gVisor container per stage, read-only, 1 CPU, 1 GB, destroyed after |

Proven on every run: **`runsc` · secrets inside sandbox: 0 · 214 off-site requests
blocked on a real site**

---

# Architecture

*Screenshot: docs/architecture.png*

The orchestrator never runs page content. The sandbox never holds a secret. The two talk
over one line of JSON at a time.

**Running on Vultr**

- **Cloud Compute** — the VM running every service
- **Serverless Inference** — all AI calls, on `glm-5.3`
- **Object Storage** — audit and journey screenshots
- **Firewall** — the only open ports are 80 and 443

---

# Who needs this

**Agencies** hand a client a report instead of a promise — every launch, same checks.

**Founders** find the dead signup button before the ad spend does.

**QA and SEO teams** get journeys clicked and pages audited together, with evidence
attached, rather than two separate tools and a spreadsheet.

**Anyone evaluating browser agents** gets a containment model they can read, test and
copy — the guards are plain code, not a prompt.

---

# What's next

- **Staging mode** — approved form submissions and logins, behind an explicit human OK
- **Scheduled audits** — run on every deploy, report only what changed
- **CI check** — fail the build when a journey breaks
- **Multi-region** — audit from the regions your users are actually in

**Live:** https://app.149.28.205.32.sslip.io
**Repo:** https://github.com/shah541-g/ShipCheck
**Video:** *(add the YouTube link)*
