# Deploy an update to the VM

Steps for the person who owns the VM. Everything here runs on the VM over SSH.

This update (8 Nov 2026) contains two changes:

1. **A false-positive fix.** The link checker used to report a link as "Broken internal
   link" when our own check simply timed out. On a slow site that marked healthy pages
   as dead. It now retries once and never reports a link it could not actually check.
   *(This changes `sandbox/runner.js`, so the sandbox image must be rebuilt.)*
2. **More time for the explore stage.** `EXPLORE_TIMEOUT_MS` goes from 7 to 10 minutes,
   so slow sites get more of their planned pages audited instead of being skipped.
   *(This is one line in `.env`.)*

Total time: about 5 minutes.

---

## Before you start

Log in to the VM:

```bash
ssh deploy@149.28.205.32
cd ~/shipcheck
```

Make a backup of the current sandbox image, so you can go back instantly if anything
goes wrong:

```bash
docker tag shipcheck-sandbox:latest shipcheck-sandbox:backup
```

---

## Step 1 — Get the new code

```bash
git pull
```

You should see `sandbox/runner.js` in the list of changed files.

---

## Step 2 — Change one line in `.env`

```bash
nano .env
```

Find this line:

```env
EXPLORE_TIMEOUT_MS=420000
```

Change it to:

```env
EXPLORE_TIMEOUT_MS=600000
```

Save and close. If the line is not there at all, add it.

---

## Step 3 — Rebuild the sandbox image

This is the important one. The fix lives inside the sandbox image, so without this
step nothing changes.

```bash
docker build -t shipcheck-sandbox:latest ./sandbox
```

Wait for it to finish. The last line should say `naming to docker.io/library/shipcheck-sandbox:latest`.

---

## Step 4 — Restart the app

```bash
docker compose up -d
```

Then confirm everything came back up:

```bash
docker compose ps
curl -s https://app.149.28.205.32.sslip.io/api/health
```

The health check must print `true` for every value:

```json
{"ok":true,"docker":true,"sandboxImage":true,"proxy":true,"llmConfigured":true}
```

---

## Step 5 — Check that the fix really works

Run one audit of a slow site and look at the findings.

```bash
curl -s -X POST https://app.149.28.205.32.sslip.io/api/jobs \
  -H 'content-type: application/json' \
  -d '{"url":"https://racing365.com/"}'
```

That prints an id. Open the report in a browser:

```
https://app.149.28.205.32.sslip.io/jobs/<the id>
```

Wait for it to finish, then check two things:

| What to look for | Before the fix | After the fix |
|---|---|---|
| Findings named **"Broken internal link"** pointing at `/en-gb/news` | 3 of them | **none** — that page is really a 200 |
| Pages audited | 3 | more than 3 |

If both look right, the update is done.

> If you would rather not audit that site, any slow site works. The point is simply
> that no healthy page should be reported as a broken link any more.

---

## If something goes wrong

Put the old image back and restart. This takes a few seconds:

```bash
docker tag shipcheck-sandbox:backup shipcheck-sandbox:latest
docker compose up -d
```

To also undo the code change:

```bash
cd ~/shipcheck
git log --oneline -3          # find the commit before the fix
git checkout <that-commit> -- sandbox/runner.js
docker build -t shipcheck-sandbox:latest ./sandbox
docker compose up -d
```

Useful when reading what happened:

```bash
docker compose logs --tail=80 api
docker compose logs --tail=40 egress-proxy
```

---

## Quick reference

The whole update in one block:

```bash
ssh deploy@149.28.205.32
cd ~/shipcheck
docker tag shipcheck-sandbox:latest shipcheck-sandbox:backup
git pull
nano .env                                             # EXPLORE_TIMEOUT_MS=600000
docker build -t shipcheck-sandbox:latest ./sandbox
docker compose up -d
curl -s https://app.149.28.205.32.sslip.io/api/health
```
