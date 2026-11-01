# MCP Servers

**Not configured yet.** GitHub Copilot in VS Code reads workspace MCP config from `.vscode/mcp.json` (top-level key `servers`), not from this folder. This folder only documents the servers.

| Server | What it gives | Transport | Usable now? | Details |
|---|---|---|---|---|
| **Vultr MCP Server** | Read-only queries of your Vultr account (instances, billing, credit left, …); OAuth + Vultr IAM | Remote (Vultr-hosted) | After an admin enables it in Vultr IAM. **The URL isn't in the notes; get it from Vultr's docs.** | [vultr-mcp-server.md](vultr-mcp-server.md) |

ShipCheck itself uses no MCP servers: the agent's tools are its own sandbox runner commands. This server is only a **developer convenience** during the build, for checking the VM, Object Storage and the remaining credit without opening the console. It is read-only, so it cannot change or spend anything.

## Example `.vscode/mcp.json`

Once you have the URL from Vultr's docs:

```json
{
  "servers": {
    "vultr": {
      "type": "http",
      "url": "<Vultr MCP Server URL from Vultr's docs>"
    }
  }
}
```

Start it from the MCP view (or restart VS Code). The first use opens a Vultr OAuth sign-in.