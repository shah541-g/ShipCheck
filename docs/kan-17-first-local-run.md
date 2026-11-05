# KAN-17 — the first full local run

Document 3 step 5.8, run on 5 Nov 2026 against the merged main plus KAN-15 and
KAN-16. This file records what was proven, what was found, and the two things that
still need someone else's input.

## Setup that the run needed

```bash
# 1. The sandbox network must be internal AND on the documented subnet, because
#    SANDBOX_PROXY_URL pins the proxy at 172.30.0.10. Let Compose create it.
docker network rm shipcheck-sandbox          # only if it exists with another subnet
INTERNAL_TOKEN=<from apps/api/.env.development> \
  docker compose -f docker-compose.dev.yml up -d --build egress-proxy
docker network inspect shipcheck-sandbox --format 'subnet={{(index .IPAM.Config 0).Subnet}} internal={{.Internal}}'
# want: subnet=172.30.0.0/24 internal=true

# 2. The api
cd apps/api && npm run dev
```

The network on this machine had been created ad hoc with Docker's automatic
`172.19.0.0/16`, so the proxy could not take `172.30.0.10` and nothing could start.
If `docker compose up` says *no configured subnet contains IP address 172.30.0.10*,
that is this. Removing and letting Compose recreate the network is the fix.

## What was proven

`GET /api/health` → `{"ok":true,"docker":true,"sandboxImage":true,"proxy":true}`.

Three real audits ran end to end, the last of them on `https://getbootstrap.com/`:

| What | Result |
|---|---|
| Stage order | discovering → planning → exploring → analyzing → verifying → reporting → done |
| Containers | `containersUsed: 3`, one per sandbox stage, all closed |
| Secrets inside the sandbox | `secretsInSandbox: 0` |
| Pages audited | 11 |
| Findings | 31, including axe accessibility rules mapped to our severities |
| Prove-It | 28 `verified`, 1 `not_reproduced`, 2 `measured_once` |
| Screenshots | 11 of 11 stored; `GET /api/files/<job>/1.jpg` → 200, `image/jpeg` |
| Third parties | 8 hosts blocked, 226 requests, reported with the privacy finding |
| Exports | `report.md` 13 KB and `report.json` 21 KB, both 200 |
| Guards | `http://localhost:3000` and `http://169.254.169.254/...` → 400 with a readable message; unknown job → 404 |

Fail-soft was proven by the same runs, because they ran with no `LLM_API_KEY`: the
job still completed with a score, a built-in summary, built-in why/fix text on every
finding, `report.ai.available: false` and three warnings in the event stream naming
the AI as the thing that was unavailable. Nothing in the deterministic half depends
on the provider.

`sandboxRuntime` is `runc` here, which is correct: gVisor is a Linux runtime and this
is Docker Desktop on Windows. The production VM runs `runsc`, and the report prints
whichever one actually ran rather than whatever the config says.

## A real bug this run found

The report's "Third-party services contacted" finding read only the egress proxy's
block counts. The browser write-guard (L3) aborts an off-site request before it
reaches the network, so the proxy sees almost nothing — on a normal site the list came
back empty while 226 third-party requests to 8 hosts had in fact been blocked. The
report builder now merges both layers and takes the larger count per host, so the
finding reflects what happened. The network layer's own count still shows only the
proxy's, so nothing is double counted.

## Still open

Both of these need something this machine does not have; neither is a code problem.

1. **The AI half of the run.** `LLM_API_KEY` is empty in `apps/api/.env.development`,
   so planning, the explorer loop and the written summary all took the fail-soft path.
   What is therefore still unproven end to end: `AI planned N journeys`, the
   `agent_step` events, a `journey.failed` finding, and an AI-written why/fix. Paste a
   Vultr inference key into that file, confirm the model with
   `node --env-file=.env.development scripts/llm-smoke.js` (see
   [kan-21-ai-model.md](kan-21-ai-model.md)), and run the audit again.
2. **The demo site's deliberate traps.** Step 5.8 expects the broken *Start free
   trial* journey from our own demo site, which needs it deployed on the VM (Dev3).
   A local file-served copy cannot be used: the input guard rejects `localhost` and
   bare IPs, and the sandbox has no route to the host.

## Commands to repeat it

```bash
ID=$(curl -s -X POST http://localhost:4000/api/jobs \
  -H 'content-type: application/json' -d '{"url":"https://getbootstrap.com/"}' | jq -r .id)
curl -N http://localhost:4000/api/jobs/$ID/events      # live, Ctrl+C at "done"
curl -s http://localhost:4000/api/jobs/$ID | jq '.report | {score, grade, counts, thirdPartyHosts, containment}'
curl -s -o report.md http://localhost:4000/api/jobs/$ID/report.md && head -40 report.md
```
