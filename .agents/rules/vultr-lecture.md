---
trigger: always_on
---

# Vultr Workshop Notes — Serverless Inference & OpenClaw

> Source: MLH Global Hack Week Cloud Week workshop (March 2026), presented by Mridul Swarup, Manager of Developer Relations at Vultr. Recording: https://www.youtube.com/live/MiwebzOh8ps. These notes come from an auto-generated transcript, so some names were misheard (e.g. "Open Cloud" / "OpenCloak" = **OpenClaw**, "Kimmy K2.5" = **Kimi K2.5**, "Cloud Code" = **Claude Code**).
>
> **Not applicable to Agent Rush:** the $250 MLH promo credit and its terms (first 100 people, 30 days) were for that event only. For this hackathon the credit is $200, and Vultr GPUs are not available — see [hackathon.md](hackathon.md).

## Vultr positioning (as presented)

- An "AI-first" global cloud; described as the world's largest privately held cloud provider.
- **32 data center regions** (most in the US, 3 in India), with more being added. Claimed ~40 ms latency even between the farthest regions.
- Compliance: HIPAA, SOC 2 and CSA, across all regions.
- **No vendor lock-in:** anything built on Vultr can run on other clouds or locally.
- Claimed cost advantages: bandwidth ~90% cheaper, instances 20–40% cheaper at scale, Serverless Inference ~70% cheaper than the industry standard.
- Simpler than the big cloud providers (AWS, Azure, GCP): deploying a server is a few clicks.

## Compute options

- **Cloud GPUs** (not available for Agent Rush): AMD Instinct series; NVIDIA GB300, B300, HGX B200; smaller A100, A40, L40 cards. From ~$0.40/hr.
- **VX1 Cloud Compute:** AMD EPYC servers; you can attach your own storage instead of paying Vultr for it.
- **Optimized Cloud Compute:** tuned for specific uses (e.g. memory-optimized).
- **Cloud Compute:** regular general-purpose VMs.
- **Bare Metal:** full control of the stack, deployable from the customer portal.

## Instance management (customer portal)

Deploy flow: **Deploy New Server** → choose type (e.g. General Purpose) and location → choose OS or a Marketplace app → configure → **Deploy**.

Options at deploy time:
- SSH keys, startup scripts, firewall group, label
- Public IPv4 / IPv6
- Automatic backups (extra cost) and DDoS protection
- Private networking behind a **NAT gateway** (for enterprise or private mesh setups)

On a running instance:
- Usage graphs and settings
- Change networks, attach a firewall
- Custom ISO, change OS (rebuilds the server; back up first), reinstall SSH keys
- **Snapshots:** a saved copy of the instance at that moment that you can boot from later. Important for production.
- Backups, **User Data** (cloud-init scripts), DDoS, **BGP** (no extra charge)

## Vultr Marketplace

- Apps that come pre-installed on a new instance, at no extra charge from Vultr.
- You can publish your own app to the Marketplace.
- Docs include self-hosted app guides (copy-paste Docker Compose files).

## Vultr Serverless Inference

- **API-only:** nothing to install. Create a subscription in the portal (**Create Inference** → label → acknowledge charges), then use its API key.
- OpenAI-compatible; switch models by changing the model ID. Offers most major open-source models.
- No upfront charges. Pricing: **~$0.55 per 1M input tokens, ~$2.75 per 1M output tokens.**
- Kimi K2.5 cost example given: about $3 for 10M tokens. (As transcribed; this looks too low compared with the prices above.) Credits are unlikely to run out from model usage.
- Endpoints:
  - **Prompt:** one-off or few-turn prompts.
  - **Chat:** multi-turn conversations that keep context.
  - **Text-to-speech**
  - **Vector store:** for RAG (retrieval-augmented generation) pipelines.
- Example model used in the demo: **Moonshot AI Kimi K2.5**.

## OpenClaw (open-source agent) on Vultr

- Available as a Vultr Marketplace app on all instance types; deploys on **Ubuntu 24**.
- After deploying, the instance page shows a **launch URL plus a username and password** for the OpenClaw console.
- Comes pre-connected to a Vultr Serverless Inference subscription (Kimi K2.5 in the demo).
- Console: chat with the agent, add agents, skills (51 built-in) and nodes. Integrations include GitHub, Discord, Slack, WhatsApp and Apple apps.
- **Agent files** define behavior and persona (e.g. "software engineer", "DevOps"); you can add tools there.
- Change model or key: SSH into the instance, then edit the JSON config (API key, model ID, model name). OpenClaw picks up the change automatically.
- Can also be installed without the Marketplace app (interactive or manual setup, per docs.vultr.com). Access uses a token-protected dashboard.
- Slack: in a channel, tag the bot and add it, then **@mention it in every message** or it won't respond. It keeps context across messages. Replies are slower than running locally.

## Helpful resources

- **docs.vultr.com**: all documentation, plus a YouTube playlist of ~15-minute all-in-one "build apps" videos.
- **agent.vultr.com (Vultr Agent):** a Vultr-specific chatbot that answers from the docs and cites sources. Docs pages also have an **"Explain code"** button that uses it.
- **Guide: deploying Claude Code projects on Vultr using Coolify** (Coolify is a self-hosted deployment platform), going from code to production with no manual setup.
- Usage/credit alerts: email plus the in-portal notification center. You get a warning email before credits run out; services aren't removed without notice.
