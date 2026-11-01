---
name: shipcheck-containment
description: "ShipCheck's containment design and proof: the 6 safety layers (input guard, action guard, browser guard, egress proxy, secret guard, resource guard) and the files that implement them, the sandbox docker run flags, the egress proxy allowlist and private-IP guard, the 7-check containment-check script, the Phase 9 security checklist, the demo containment moments and the SECURITY-TEST placeholder rule. Use when writing or reviewing any security-relevant ShipCheck code (runner, runSandbox, actionGuard, policy, egress-proxy), proving containment, or explaining it in the README, video or slides."
---

# ShipCheck: Containment

Background on why these choices were made: the [agent-sandbox-design](../agent-sandbox-design/SKILL.md) skill. Exact code: [03-build-steps.en.md](../../../planning/03-build-steps.en.md) (Phases 2–4 and 9).

## The 6 layers

| Layer | Stops | Code | Build step |
|---|---|---|---|
| **L1 Input guard** | Non-http(s) URLs, URLs with credentials, ports other than 80/443, IP addresses, `localhost` / `.local` / `.internal` / `.lan` / `.home.arpa`, ShipCheck itself, non-public domains | `apps/api/src/security/policy.js` → `normalizeTarget()` | 4.2 |
| **L2 Action guard** | Anything outside the 6 action types (zod discriminated union), elements not in the current snapshot, off-site `goto`, typing into password or card fields, text over 200 characters, danger-word clicks (delete, remove, pay, buy, checkout, order, purchase, subscribe, unsubscribe, transfer, log out), budget overruns, the same action 3 times | `apps/api/src/security/actionGuard.js` | 4.2 |
| **L3 Browser guard** | Off-site requests (popups included, because the route is on the context); safe-mode non-GET requests; service workers; `confirm` / `alert` (always dismissed) | `sandbox/runner.js` → `guardContext()` | 2.2 |
| **L4 Network guard** | Any direct internet (the `internal: true` network); hosts outside the per-job allowlist (target + www + common CDNs); private, loopback and metadata IPs (checked after DNS, so `localtest.me` is caught too); ports other than 80/443; requests without a job token (407) | `apps/egress-proxy/src/{allowlist,ipguard,proxy}.js` | 3.2 |
| **L5 Secret guard** | Any ShipCheck secret inside the sandbox. `docker run` has **no `-e`, no `-v`, no socket**; the runner reports `envSecretsCount` | `apps/api/src/sandbox/runSandbox.js` | 4.4 |
| **L6 Resource guard** | Runaway or escaping workloads | `runSandbox.js` (flags below) | 4.4 |

**Sandbox `docker run` flags (L5 + L6), never weaken these:**

```
run --rm -i --name shipcheck-job-<id8>-<stage> --network shipcheck-sandbox
--memory 1g --memory-swap 1g --cpus 1 --pids-limit 1024
--read-only --tmpfs /tmp:rw,size=512m --shm-size 512m
--cap-drop ALL --security-opt no-new-privileges
--runtime runsc            (when SANDBOX_RUNTIME=runsc)
shipcheck-sandbox:latest   (Playwright image, USER pwuser)
```

There is one fresh container per stage (discover, explore, verify), always closed afterwards. The report shows the number of containers used and "Secrets inside sandbox: 0".

## Proof

**`apps/api/scripts/containment-check.js`** (Step 3.5) must print **7 × PASS**:
1. No direct internet from the sandbox network.
2. The proxy without a job token answers 407.
3. An allowed host works through the proxy.
4. A host outside the allowlist is blocked.
5. The cloud metadata IP `169.254.169.254` is blocked.
6. An allowed name that resolves to 127.0.0.1 (`localtest.me`) is blocked.
7. A non-standard port is blocked.

```bash
# dev (from apps/api)
node --env-file=.env.development scripts/containment-check.js
# production (Step 9.1): screenshot the output for the README and slides
docker compose exec api node scripts/containment-check.js
```

**Security checklist (Step 9.2), all must be true:**
- Only `caddy` publishes 80/443.
- The Vultr firewall allows 22 from the admin IP only.
- `git ls-files | grep -i "\.env"` lists only the two `.example` files.
- `runSandbox.js` has no `-e`, `-v` or socket mount.
- 9.1 passed.
- A demo run's logs show zero non-GET requests leaving the sandbox (they appear as `BLOCKED (browser): ... write request`).
- `POST /internal/events` and `/api/internal/events` through Caddy return 404/405.
- The demo report shows `Runtime: runsc` and `Secrets inside sandbox: 0`.
- The rate-limit test (Phase 8, row 12) passed.
- The VM `.env` is `chmod 600`.

## Containment moments for the video (Core)

- **BLOCKED (network): attacker.example**: the demo home page's exfiltration attempt, stopped by the proxy (L4).
- **BLOCKED (browser): … write request**: the explorer's form submission in safe mode (L3).
- **The hidden prompt-injection text**: reported as `security.prompt_injection_text` and never obeyed. Page text reaches the AI marked as untrusted.
- **The containment-check terminal output**: 7 × PASS.
- **Stretch S4:** the hijack drill ("0 of N harmful actions got through").

## SECURITY-TEST rule

The demo-site traps (S1 hidden injection note, S3 exfiltration script) and the hijack-drill attack list come from the separate **security-test spec**, written after kickoff. In the build steps they appear as `SECURITY-TEST: …` comments. **Do not invent or fill in attack content from this skill or the build steps;** leave the placeholders until the spec is provided.

## Review checklist for any change touching these files

- Does any new code path let page content, AI output or user input reach the host, the network, or a secret?
- Is every new AI-chosen action still validated by `ActionSchema` and the guard **before** it reaches the runner?
- Does the change add an env var, volume or mount to the sandbox? (It must not.)
- Do the existing guard tests still pass (`apps/api/test/{policy,actionGuard}.test.js`, `apps/egress-proxy/test/*`)? Add a test for the new case.
