# MCP Servers

**Not configured yet.** Antigravity configures MCP servers from the agent panel (**MCP Servers → Manage MCP Servers → View raw config**), which edits a user-level `mcp_config.json` (under `~/.gemini/antigravity/`). That config is not per-workspace and is not read from this folder; this folder only documents the server. Check the current Antigravity docs, because paths have changed between versions.

| Server | What it gives | Transport | Usable now? | Details |
|---|---|---|---|---|
| **Vultr MCP Server** | Read-only queries of your Vultr account (instances, billing, credit left, …); OAuth + Vultr IAM | Remote (Vultr-hosted) | After an admin enables it in Vultr IAM. **The URL isn't in the notes; get it from Vultr's docs.** | [vultr-mcp-server.md](vultr-mcp-server.md) |

ShipCheck itself uses no MCP servers: the agent's tools are its own sandbox runner commands. This server is only a **developer convenience** during the build, for checking the VM, Object Storage and the remaining credit without opening the console. It is read-only, so it cannot change or spend anything.

## Example `mcp_config.json` entry

Once you have the URL from Vultr's docs:

```json
{
  "mcpServers": {
    "vultr": {
      "serverUrl": "<Vultr MCP Server URL from Vultr's docs>"
    }
  }
}
```

The `serverUrl` key for remote servers is how Antigravity has named it; verify it against the current docs. Then refresh the MCP server list. The first use opens a Vultr OAuth sign-in.