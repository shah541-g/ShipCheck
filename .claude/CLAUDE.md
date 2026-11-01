# CLAUDE.md

This project is an entry for the **Vultr: Agent Rush Hackathon** (online build 3–8 Nov 2026; submissions close Nov 9, 4:00 AM PKT).

**We are building ShipCheck** (Challenge 1, Pattern B): an AI agent that tests a website like a real visitor inside a gVisor sandbox behind an egress proxy. The build is driven by [03-build-steps.en.md](../planning/03-build-steps.en.md), about 4,500 lines: **implement one step at a time exactly as written, and read only the step you need.** The project summary, rules and architecture are in `context/project.md` (imported below).

Key constraints at a glance:
- Must run on a Vultr VM backend with a public web app deployed on Vultr.
- Challenge 1 (Blast Radius Zero) requires Vultr Serverless Inference (`https://api.vultrinference.com/v1`, OpenAI-compatible) and isolated sandbox execution. No Vultr GPUs are available.
- Submission goes through lablab.ai; the README must document how Vultr is used.

## How the notes are organized

- **`context/`**: background, always loaded (imported below).
- **`skills/`**: how-to guides as Claude Code skills. Each loads only when its task comes up, matched by its `description`. Images live inside each skill's `images/` folder.
- **`mcps/`**: MCP servers referenced in the notes and how to configure them. Nothing is configured yet; see [mcps/README.md](mcps/README.md).

## Context (always loaded)

The ShipCheck project: decision, how to work, architecture, repo layout, safety layers, hard rules, cut order, schedule, team.

@context/project.md

Hackathon details: challenges, technology requirements, submission checklist, judging, prizes, schedule. Consult before making architecture or scope decisions.

@context/hackathon.md

General overview of the Vultr platform.

@context/vultr.md

Notes from a Vultr workshop: Serverless Inference endpoints and pricing, customer portal, Marketplace, OpenClaw.

@context/vultr-lecture.md

## Skills (loaded on demand)

| Skill | Use for |
|---|---|
| [shipcheck-vultr-deploy](skills/shipcheck-vultr-deploy/SKILL.md) | VM, firewall, Docker, gVisor, inference key, Object Storage, Caddy, production compose and `.env`, updates, troubleshooting, teardown |
| [shipcheck-containment](skills/shipcheck-containment/SKILL.md) | The 6 safety layers and their files, sandbox `docker run` flags, the containment check, the security checklist, the SECURITY-TEST rule |
| [shipcheck-submission](skills/shipcheck-submission/SKILL.md) | End-to-end tests, README, video script, slides, lablab.ai texts, final checklist |
| [vultr-serverless-inference](skills/vultr-serverless-inference/SKILL.md) | Inference key, choosing the model with `llm-smoke.js`, account key vs inference key |
| [gvisor](skills/gvisor/SKILL.md) | Installing `runsc`, the fixed-IP DNS gotcha, the `runc` fallback |
| [agent-sandbox-design](skills/agent-sandbox-design/SKILL.md) | Why this isolation design; background for the README and slides |
| [nextjs-developer](skills/nextjs-developer/SKILL.md) | The `apps/web` Next.js app (App Router, client vs server components, standalone Docker build); the build steps override its general rules |
| [fastapi-clean-architecture](skills/fastapi-clean-architecture/SKILL.md) | Python/FastAPI services with Clean Architecture. **Not for ShipCheck's api**, which is Node.js + Express |
| [django-developer](skills/django-developer/SKILL.md) | Django (async views, Django Ninja, HTMX, Channels). **Not for ShipCheck's api or web app** |

## Documentation references

- **Vultr Serverless Inference API docs:** https://api.vultrinference.com/docs. Check this first for endpoints, request/response formats, available models and auth before writing or changing any inference code. Prefer it over memory or the notes when they disagree.
- **Vultr Developer Resources:** https://www.vultr.com/resources/developers/. The general hub for any Vultr question the notes don't cover.
- When a note seems incomplete or outdated, fetch its live source from the table below.

## Source links

| Topic | Live source | Notes file |
|---|---|---|
| ShipCheck build steps (v2 Core) | local file | [03-build-steps.en.md](../planning/03-build-steps.en.md) |
| ShipCheck agent definition (Document 1) | local file | [01-agent-definition.en.md](../planning/01-agent-definition.en.md) |
| Vultr Developer Resources | https://www.vultr.com/resources/developers/ | none |
| Introduction to Vultr (GeeksforGeeks) | https://www.geeksforgeeks.org/cloud-computing/what-is-vultr/ | [context/vultr.md](context/vultr.md) |
| Vultr workshop: Serverless Inference + OpenClaw (YouTube) | https://www.youtube.com/live/MiwebzOh8ps | [context/vultr-lecture.md](context/vultr-lecture.md) |
| What is an agent sandbox? (Solo.io) | https://www.solo.io/blog/what-is-an-agent-sandbox-a-guide-to-isolated-execution-for-ai-agents | [agent-sandbox.md](skills/agent-sandbox-design/references/agent-sandbox.md) |
| Agent sandboxes for enterprise (Medium) | https://medium.com/@balajibal/agent-sandboxes-the-runtime-layer-for-enterprise-ai-agents-88f207ac5e2e | [enterprise-sandboxes.md](skills/agent-sandbox-design/references/enterprise-sandboxes.md) |
| Vultr Serverless Inference API reference | https://api.vultrinference.com/docs | none (use the live docs) |
| Provisioning Serverless Inference (Vultr Docs) | https://docs.vultr.com/products/compute/serverless-inference/provisioning | [vultr-serverless-inference](skills/vultr-serverless-inference/SKILL.md) |
| gVisor docs | https://gvisor.dev/docs/ | [gvisor](skills/gvisor/SKILL.md) |
| Vultr MCP Server announcement | https://blogs.vultr.com/vultr-mcp-server-public-preview | [mcps/vultr-mcp-server.md](mcps/vultr-mcp-server.md) |
