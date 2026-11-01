---
name: shipcheck-vultr-deploy
description: "Provision and deploy ShipCheck on Vultr: firewall group, Ubuntu 24.04 VM, deploy user and SSH hardening, swap, Docker, gVisor runsc, Serverless Inference key and model choice, Object Storage bucket, Caddy on sslip.io, the production docker-compose (caddy/web/api/egress-proxy, internal sandbox network with the proxy at 172.30.0.10), the production .env, updates, troubleshooting and teardown. Use for any VM, infrastructure, deployment or production-debugging task on ShipCheck (build-steps Phases 1, 7, 12 and Troubleshooting)."
---

# ShipCheck: Deploy on Vultr

The full commands are in [03-build-steps.en.md](../../../planning/03-build-steps.en.md). Open the step named below and follow it exactly. This skill is the map, plus the gotchas.

## Kickoff night (Phase 1)

| Step | What | ✅ Check |
|---|---|---|
| 1.1 | Claim credits: Vultr **Billing** → gift code | about $200 shown |
| 1.2 | Firewall group `shipcheck`: TCP 22 from **My IP**; 80 and 443 from anywhere (IPv4 + IPv6) | 3 IPv4 rules, 2 IPv6 rules |
| 1.3 | VM: Cloud Compute, Shared CPU, **Ubuntu 24.04**, **2 vCPU / 4 GB**, near US judges (New Jersey / Silicon Valley), SSH key `~/.ssh/shipcheck`, firewall `shipcheck` | `ssh -i ~/.ssh/shipcheck root@<IP>` works |
| 1.4 | User `deploy` (sudo, key login), password login off, `ufw allow 22,80,443`, **2 GB swap** | a second window logs in as `deploy`; `free -h` shows swap |
| 1.5 | Docker via `get.docker.com`; add `deploy` to the `docker` group, then log in again | `docker run --rm hello-world` |
| 1.6 | **gVisor (CRITICAL CHECKPOINT):** apt repo → `runsc` → `sudo runsc install` → restart Docker | `docker run --rm --runtime=runsc hello-world`. If it fails tonight, decide `SANDBOX_RUNTIME=runc` now |
| 1.7 | Serverless Inference subscription → API key = `LLM_API_KEY`; `curl .../v1/models` | a JSON model list |
| 1.8 | Object Storage + bucket `shipcheck-shots-xxxx` → `S3_HOSTNAME` (no `https://`), `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | bucket listed |
| 1.9 | Public repo `shipcheck` (MIT), skeleton, demo site, day-1 `Caddyfile` and compose, `.env.example` | pushed; no `.env` in git |
| 1.10 | On the VM: clone, `.env` with `APP_HOST=app.<IP>.sslip.io` and `DEMO_HOST=demo.<IP>.sslip.io`, `docker compose up -d` | both hosts load over HTTPS; `/old-page.html` is a 404 |
| 1.12 | Choose `LLM_MODEL` / `LLM_JSON_MODE` / `LLM_VISION_MODEL` with `scripts/llm-smoke.js` (see the `vultr-serverless-inference` skill) | valid JSON **and** one clean action object |

## Production deploy (Phase 7, Fri 6 Nov)

1. **7.1 Dockerfiles.**
   - The api image copies the Docker CLI from `docker:27-cli`. It runs as **root** (it needs `docker.sock`) and never runs page content.
   - The web image is a Next.js standalone build running as `node`.
2. **7.2 Final `Caddyfile` and `docker-compose.yml`.**
   - Services: `caddy` (the only one publishing 80/443), `web`, `api` (mounts `/var/run/docker.sock` and the `api_data` volume), `egress-proxy`.
   - Networks: `public`, and `sandbox` (`name: shipcheck-sandbox`, `internal: true`, subnet `172.30.0.0/24`). The proxy has the fixed `ipv4_address: 172.30.0.10`.
   - Caddy `/api/*` → `api:4000` with `flush_interval -1` (SSE); everything else → `web:3000`. `/internal/*` is never routed to the api.
3. **7.3 Production `.env`.** Fill every value; generate a new `INTERNAL_TOKEN` with `openssl rand -hex 32`; set `SANDBOX_RUNTIME=runsc` and `STORAGE_DRIVER=s3`; then `chmod 600 .env`. Check with `grep -c "=$" .env`: only `CORS_ORIGIN` (and maybe `LLM_VISION_MODEL`) may be empty.
4. **7.4 Build and start:**
   ```bash
   docker build -t shipcheck-sandbox:latest ./sandbox
   docker compose up -d --build
   docker compose ps && docker compose logs --tail=50 api egress-proxy
   curl -s https://app.<IP>.sslip.io/api/health      # "ok":true, all values true
   ```
5. **7.5 First audit:** run **Try the demo site**. While it runs, `docker inspect --format '{{.HostConfig.Runtime}}' shipcheck-job-...` prints `runsc`, and screenshot URLs point at `https://<S3_HOSTNAME>/<S3_BUCKET>/shots/`.
6. **7.6 Update later:**
   ```bash
   cd ~/shipcheck && git pull
   docker build -t shipcheck-sandbox:latest ./sandbox   # only when sandbox/ changed
   docker compose up -d --build
   ```

## Gotchas (from Troubleshooting)

| Symptom | Fix |
|---|---|
| No certificate for `*.sslip.io` | Let's Encrypt rate limit: check `docker compose logs caddy`; fall back to two DuckDNS subdomains as `APP_HOST` / `DEMO_HOST` |
| Proxy or tunnel errors only under `runsc` | Keep `SANDBOX_PROXY_URL=http://172.30.0.10:3128` (an IP) and the fixed `ipv4_address` |
| `unknown or invalid runtime name: runsc` | Repeat Step 1.6, or set `SANDBOX_RUNTIME=runc` |
| Chromium fails with `--read-only` | The image needs `HOME=/tmp`, and the run needs `--tmpfs /tmp` |
| `Executable doesn't exist at /ms-playwright/...` | The Playwright npm version ≠ the image tag; pin them exactly equal and rebuild |
| Every page fails with `ERR_TUNNEL_CONNECTION_FAILED` | Job token not registered or wrong proxy address: check `PROXY_ADMIN_URL`, `SANDBOX_PROXY_URL`, and that `INTERNAL_TOKEN` is the same in api and proxy |
| Demo site unreachable from the sandbox in production | `/etc/docker/daemon.json` must not set `"userland-proxy": false` |
| SSE events arrive all at once | `flush_interval -1`, and no `encode`, in the `/api/*` block |
| `permission denied ... docker.sock` | Keep the api container running as root |
| `next build` killed | Check swap with `free -h` |
| S3 checksum or signature error | `forcePathStyle: true`, the two `WHEN_REQUIRED` options, and no `https://` in `S3_HOSTNAME` |
| SSH stopped working | Your home IP changed; update the firewall rule |

## After judging (Phase 12)

Keep everything running until results are out, and check `/api/health` daily. Then **destroy** the VM (a stopped VM still bills), delete Object Storage, cancel the inference subscription, delete the firewall group and revoke API keys.
