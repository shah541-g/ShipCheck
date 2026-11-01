---
applyTo: "**"
---

# Vultr: Agent Rush Hackathon

> Build AI agents that do real work — safely sandboxed on Vultr.

- **Format:** Hybrid hackathon (hosted by LabLab × Vultr)
- **Online build:** 3–8 November 2026
- **On-site phase:** 8 November 2026
- **On-site venue:** Pierpont Place, 163 W Pierpont Ave, Salt Lake City, UT 84101, USA
- Travel and accommodation are **not** covered.
- Every participant gets **$200 in free Vultr credits** (gift code shared at kickoff).

## Overview

Build a web-based agent that performs real work — writing and running code, or operating a real browser — with every action contained inside a sandbox running on Vultr.

The system acts as a centralized control layer: it plans a task, dispatches it to an isolated execution environment, and returns verifiable output. Projects should demonstrate:

- Multi-step agentic workflows
- Real executed results (not described ones)
- A production-style web application
- Everything running on Vultr infrastructure

**Containment-first is required.** An agent that only chats is a demo; an agent that executes safely is a product.

## Challenges (pick one)

### 01 · Blast Radius Zero

Build a web-based agent that performs real work — writing and running code or operating a real browser — while every action stays inside an isolated sandbox running on Vultr.

- **Best for:** code execution, browser automation, autonomous agents, sandboxing, verification and safety.
- **Required:** Vultr VM backend, web app on Vultr, Vultr Serverless Inference, isolated sandbox.
- **Core idea:** containment-first. The system should plan, dispatch and verify real executed work — not just describe what it would do.

**What Vultr is looking for:** use Vultr as the central control layer, dispatch real work into isolated execution environments, and return verifiable output.

**Execution patterns (one or both):**

- **Pattern A · Sandboxed code execution** — User asks → model writes code → code runs inside a container → real output returns → model explains the result. Errors can be fed back for retries.
- **Pattern B · Sandboxed browser use** — User gives a goal → model plans → Playwright runs in a container → screenshots return → a vision model verifies → human approval before final actions.

**Example directions:** CSV Analyst, Prove-It Code Reviewer, Chart Anything, File Fixer, Self-Healing Runner, Comparison Shopper, Form Filler, Site QA Sweep, Research with Receipts, Page Watcher.

**Containment focus:**

- **Process isolation:** execution never touches the host or app runtime.
- **Secret hygiene:** no API keys or credentials inside the sandbox.
- **Resource limits:** apply time and memory caps to every run.
- **Lifecycle discipline:** reset or destroy the environment after each task.

**Submission expectations:**

- GitHub repository with setup and documentation
- Vultr VM backend deployment
- Public demo URL
- Recorded demo video
- Clear architecture and use-case explanation
- **One containment moment shown in the video**

### 02 · Powering the Future of Work

Build and deploy an enterprise-focused AI solution that coordinates realistic multi-step workflows and improves how teams operate day to day.

- **Best for:** sales ops, finance, HR, customer support, procurement, workflow automation and enterprise AI.
- **Required:** Vultr VM backend, web app on Vultr. Serverless Inference is optional.
- **Core idea:** build a real platform or operational workflow, not a one-off demo.

**Focus areas:**

- **Sales Operations:** qualify leads, research prospects, update CRM, draft outreach and follow up.
- **Finance & Accounting:** process invoices, reconcile transactions, flag anomalies and manage payment follow-ups.
- **HR & Recruitment:** screen candidates, schedule interviews, coordinate onboarding and track employee workflows.
- **Customer Support:** resolve tickets across systems, investigate issues, take actions and escalate when human input is needed.
- **Procurement:** monitor purchasing needs, compare vendors, request quotes, track orders and follow up on delays.

**Product expectations:**

- Accessible through a public web browser.
- A real product-style experience with clear user flows.
- Vultr as the central backend powering planning, workflows and operations.
- Platform thinking rather than a one-off local demo.

**Submission expectations:**

- GitHub repository with setup and documentation
- Vultr VM backend deployment
- Public demo URL
- Recorded demo video
- Clear architecture and use-case explanation

## Technology & Access

> **Vultr GPUs are not available for this event.** Challenge 1 must use Vultr Serverless Inference for agent LLM calls; for Challenge 2 it is optional.

| Technology | Notes | Requirement |
|---|---|---|
| **Vultr Cloud Compute** | Both challenges require a Vultr VM backend; the web app must be deployed on Vultr. Vultr should be the central system of control and orchestration, not just static hosting. | Core · both challenges |
| **Vultr Serverless Inference** | OpenAI-compatible inference at `https://api.vultrinference.com/v1`. | Required C1 · optional C2 |
| **Agent sandboxing** | Isolated execution. Docker strongly recommended; OpenSandbox, gVisor, E2B Sandboxes, Microsandbox are example approaches. | Challenge 1 |
| **Vultr API & app acceleration** | C1 may use the Vultr API for throwaway instances. C2 can use Supabase on Vultr and Coolify on Vultr. | Optional / recommended |

**Resources:** vultr.com · Serverless Inference docs (API reference: https://api.vultrinference.com/docs) · Live model list · Vultr API · Sandboxing guide · OpenSandbox · gVisor · E2B · Microsandbox · Supabase on Vultr · Coolify on Vultr.

### Claiming credits ($200)

1. Use an email address never previously associated with a Vultr account.
2. Create an account on the Vultr Registration Page, accept ToS/Privacy Policy, click **Create Free Account**.
3. Verify your email (click **Verify Your E-mail**) → redirected to the Vultr Console.
4. At kickoff, open the hackathon promotion page in **Billing** → **Gift Code** → enter the event code → **Apply Gift Code**.
5. Account should show **$200.00 Remaining Credit**. Credits stay active throughout the event; add a payment method to keep deployments afterward.

Credits can be used for Compute Instances, Managed Databases, Kubernetes clusters and other Vultr services.

**Video guides** (Sanskriti Harmukh, Junior DevRel @ Vultr): claiming credits; deploying Next.js with the Supabase Marketplace App; deploying with the Coolify Marketplace App.

## Prizes (up to $15,000)

$9,000 cash + $5,000 Vultr credits + up to $1,000 in onsite raffle prizes.

| Place | Cash | Vultr credits |
|---|---|---|
| 🥇 1st | $5,000 | $3,000 |
| 🥈 2nd | $3,000 | $1,000 |
| 🥉 3rd | $1,000 | $1,000 |

**Onsite raffle** (3 individual in-person winners): PlayStation 5 Standard, Apple AirPods 5 with Wireless Charging Case, Razer DeathAdder V3 HyperSpeed.

Prizes depend on eligibility/sponsors; rules may change. Submissions must be original and MIT-compliant. Prize distribution may take up to 90 days.

## Guidelines

- Runs on the LabLab platform and LabLab Discord — register for both. Read the Hackathon Guidelines, Getting Started Guide and LabLab Hackathon Rule Book.
- Teams of **1–6 people**.

### What to submit (on lablab.ai — required for judging)

- **Basic info:** project title, short description, long description, technology & category tags
- **Presentation:** cover image, video presentation, slide presentation
- **Hosting:** public GitHub repository, demo application platform, application URL, Vultr-specific documentation

### Show how you used Vultr (in the public GitHub README)

- Explain the Vultr services and infrastructure used.
- Document the backend/deployment architecture and how Vultr powers the solution.
- Explain the agent's use case and how it executes real tasks.
- **Challenge 1:** demonstrate at least one containment moment in the demo video.
- No separate Vultr architecture report is needed — it belongs in the README.

**Optional:** also showcase the project on Vultr Community for extra exposure (does not replace the LabLab submission).

## Judging Criteria

- **Application of Technology** — how effectively the chosen model(s) are integrated.
- **Presentation** — clarity and effectiveness of the presentation.
- **Business Value** — impact and practical value in business areas.
- **Originality** — uniqueness and creativity; approaches and ability to demonstrate behaviors.

## Event Schedule (Pakistan Standard Time)

| Date/Time (PKT) | Event |
|---|---|
| Nov 3, 9:00 PM | Hackathon kick-off |
| Nov 3, 10:00 PM | Discord Q&A session |
| Nov 8, 9:00 PM | Doors open (on-site) |
| Nov 8, 9:30 PM | Welcoming remarks (on-site) |
| **Nov 9, 4:00 AM** | **End of submissions** |
| Nov 9, 6:00 AM | Doors close (on-site) |
