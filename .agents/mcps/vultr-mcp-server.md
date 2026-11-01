# Vultr MCP Server (Public Preview)

> Source: Vultr blog, "Vultr MCP Server Currently Available in Public Preview for Enhanced Visibility and Oversight" (23 Oct 2026). **Link: https://blogs.vultr.com/vultr-mcp-server-public-preview**. The blog links to Vultr's docs for getting started, admin controls, tools and example prompts. **The server URL is not in the blog post; get it from those docs.**

## What it is

A **read-only**, **Vultr-hosted** MCP server that lets agents and AI clients query your Vultr account in plain language. It is built on the open MCP protocol. Vultr also announced it joined the **Agentic AI Foundation as a Gold member**.

The blog's framing: MCP servers connect apps to external systems, data and tools, while sandboxing isolates the code those tools run. **Read-only MCP servers restrict what agents can do**, which reduces side effects and risk and avoids complex approval layers.

## Setup

Nothing to install, because Vultr hosts the server.
1. Add **one URL** to your MCP client.
2. **Sign in to Vultr** (OAuth).
3. **Approve access**.

**Example prompts:**
- "Which instances are running in London, and on what plans?"
- "Does my Kubernetes cluster have an upgrade available?"
- "Give me a summary of last month's invoice by product and recommend options for cost savings."

**Coverage:** compute, Kubernetes, networking, storage, databases, billing, user account, and more.

## Security model

- **Read-only:** it can view resources and account info, but **cannot create, modify or delete** resources and **cannot spend money**. Any action beyond reading is denied.
- It **never returns credentials** or access data (auth tokens, passwords).
- **Vultr IAM gated:**
  - An admin must **enable the MCP Server in Vultr IAM**, then grant agent access to specific users.
- **OAuth sign-in** with the user's Vultr account:
  - **no API key** to create or copy
  - the server stores **no credentials of its own**
  - each sign-in is tied to **one organization**
  - **every request runs as the signed-in user**

## Integration

- **One endpoint per product area** (compute, Kubernetes, databases, …). Expose the whole stack, a few products, or one. This reduces tool-selection overhead and token use.
- Works with any client that supports **remote MCP**: Claude, Cursor, VS Code, Codex and others.
- Supports **remote / headless sessions** (e.g. over SSH) via **device authorization**.
- **Two organizations at once:** add the server twice under different names.
- More capabilities are "coming soon"; this preview is the first step.

## Notes for Agent Rush (my additions, not from the blog)

- **Dev tooling:** add it to Claude Code during the build to check instances, plans, regions and billing (e.g. "how much of my $200 credit have I used?") without opening the console. It's read-only, so it's safe to use.
- **Product ideas:**
  - Challenge 2 (IT/FinOps): a "cloud cost and inventory assistant" agent.
  - Challenge 1: a read-only "infrastructure inspector" tool for the agent.
- **Design pattern to copy and cite in the README:**
  - least-privilege tools (read-only by default)
  - OAuth user identity instead of shared API keys
  - no credentials stored by the tool
  - per-domain endpoints to narrow what the agent can reach

  This is the same "a sandbox isn't enough, also govern what agents can call" point made in [agent-sandbox.md](../skills/agent-sandbox-design/references/agent-sandbox.md).
- It **can't provision** sandboxes or instances. For throwaway VMs, use the Vultr API (`api.vultr.com/v2`) with an account API key kept on the control plane.
