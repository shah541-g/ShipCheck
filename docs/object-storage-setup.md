# Vultr Object Storage: setup steps

ShipCheck takes screenshots during an audit. In production those screenshots are
uploaded to **Vultr Object Storage** so the report page can display them.

This is **Phase 1, step 1.8** of the build steps. It belongs to the person who owns
the VM and runs the deploy (Dev3 / Infra), because the four values it produces are
only ever written into the VM's `.env` file.

It gives us four values:

| Value | What it is |
|---|---|
| `S3_HOSTNAME` | The storage server's address, e.g. `ewr1.vultrobjects.com` |
| `S3_BUCKET` | The container we upload into, e.g. `shipcheck-shots-ab12` |
| `S3_ACCESS_KEY` | The username for that storage |
| `S3_SECRET_KEY` | The password for that storage |

Nobody has these already. They do not exist until you create the storage. They are
created **inside your own Vultr account** — the same account that has the VM and the
$200 credits.

Time needed: about 10 minutes, mostly clicking in the browser.

---

## Before you start

- You are logged in to the Vultr console: <https://my.vultr.com>
- Your hackathon credits show under **Billing** (about $200)
- You know which region your VM is in (for example New Jersey). Pick the same region
  for the storage, so uploads are fast.

---

## Step 1 — Create the Object Storage subscription

1. In the console, open **Products** → **Cloud Storage** → **Object Storage**.
   Direct link: <https://my.vultr.com/objectstorage/>
   *(If your console shows **Products → Object Storage** directly, that is the same
   place. Vultr's own docs describe both layouts.)*
2. Click **Create Object Storage**.
3. **Select the tier: `Standard`.**

   Vultr offers five tiers — Accelerated, Performance, Premium, Standard and Archive.
   We store a few megabytes of JPEGs and read them from a web page, so Standard is
   the right one.

   > **Do not pick `Archive`.** Archive moves objects into an archival storage class
   > through a lifecycle policy, so the screenshots would stop being directly
   > readable. It is also not the cheapest option for us.

4. **Select your location** — the same region as the VM if it is offered.
5. Enter a **Name**, for example `shipcheck`. This is just a label in the console; it
   is not used in any config.
6. Click **Create Object Storage**.

Wait about a minute. The status changes to **Active**.

✅ **Check:** the new storage appears in the list and is Active.

---

## Step 2 — Copy the three credentials

1. Click on the storage you just created.
2. You land on its **Overview** page. It shows these fields:

   | Field on the Overview page | Which variable it is |
   |---|---|
   | **S3 Endpoint** (sometimes labelled *Hostname*) | `S3_HOSTNAME` |
   | **Access Key** | `S3_ACCESS_KEY` |
   | **Secret Key** | `S3_SECRET_KEY` |

   The Overview page also shows a **Default Region** — we do not need it.

   The secret key is usually hidden; click the eye icon or **Show** to reveal it.
   If your console has a separate **Credentials** section instead, the keys are there,
   along with a **Regenerate Keys** button.

3. Copy all three somewhere safe for now — a local text file, **not** a chat app.

> **Important:** `S3_HOSTNAME` must **not** include `https://`.
> Correct: `ewr1.vultrobjects.com`
> Wrong: `https://ewr1.vultrobjects.com`
> Our code adds `https://` itself, so leaving it in makes every upload fail.

---

## Step 3 — Create the bucket

A bucket is a named container for the files.

1. On the same subscription, open the **Buckets** section.
2. Click **Create Bucket**.
3. Name it `shipcheck-shots-` plus four random lowercase characters, for example
   `shipcheck-shots-ab12`.
   - Use **lowercase letters, numbers and hyphens only**. No spaces, no capitals, no
     underscores — the name has to be usable inside a web address.
4. Create it.

That name is your `S3_BUCKET`.

✅ **Check:** the bucket appears in the Buckets list.

---

## Step 4 — Make the bucket's files readable in a browser

This step matters. Vultr keeps objects **private by default**, so without it the
report page will show broken images.

Our uploader already marks every screenshot as publicly readable as it uploads it.
Vultr's documentation does not promise that per-file marking is honoured, and
documents a **bucket policy** instead. So we apply the bucket policy as well — then
it works either way.

Run this on the VM (or any Linux machine):

```bash
# 1. Install the s3cmd tool
sudo apt update && sudo apt install -y s3cmd

# 2. Point it at your storage. Replace the three values.
cat > ~/.s3cfg <<'EOF'
[default]
access_key = YOUR_ACCESS_KEY
secret_key = YOUR_SECRET_KEY
host_base = ewr1.vultrobjects.com
host_bucket = %(bucket)s.ewr1.vultrobjects.com
use_https = True
EOF
chmod 600 ~/.s3cfg

# 3. Write the policy. Replace shipcheck-shots-ab12 with your bucket name.
cat > /tmp/public-read.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::shipcheck-shots-ab12/*"
    }
  ]
}
EOF

# 4. Apply it
s3cmd setpolicy /tmp/public-read.json s3://shipcheck-shots-ab12

# 5. Confirm it is there
s3cmd info s3://shipcheck-shots-ab12
```

Edit `host_base` and `host_bucket` if your endpoint is not `ewr1.vultrobjects.com`.

✅ **Check:** step 5 prints a `Policy` section containing `s3:GetObject`.

This policy allows **reading** files only. Nobody can upload, change or delete
anything without the secret key. The bucket holds nothing but audit screenshots, so
public reading is exactly what we want.

---

## Step 5 — Put the values in the VM's `.env`

These values are used only in production, on the VM. They go in the `.env` file next
to `docker-compose.yml`, and nowhere else.

```bash
cd ~/shipcheck
nano .env
```

Set these five lines — the four values plus the switch that turns S3 on:

```env
STORAGE_DRIVER=s3
S3_HOSTNAME=ewr1.vultrobjects.com
S3_BUCKET=shipcheck-shots-ab12
S3_ACCESS_KEY=<the access key you copied>
S3_SECRET_KEY=<the secret key you copied>
```

Save and close, then lock the file so only you can read it:

```bash
chmod 600 .env
```

`STORAGE_DRIVER=s3` is the switch. With `STORAGE_DRIVER=local` the app ignores all
four values and serves screenshots from the API itself — that is what we use for
local development, and it works fine, so **do not** set `s3` on a developer machine.

The `api` service in `docker-compose.yml` must actually receive these four variables
(through `env_file: .env` or an `environment:` block). If it does not, the app starts
with local storage and nothing ever reaches the bucket.

Then restart:

```bash
docker compose up -d
```

If the API refuses to start and the log says:

```
STORAGE_DRIVER=s3 needs S3_HOSTNAME, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY
```

then one of the four lines is missing or empty. Check for typos and for a stray space
after the `=`.

---

## Step 6 — Check that it actually works

1. Open the app in a browser and run an audit (**Try the demo site** is easiest).
2. When the report appears, right-click a screenshot → **Copy image address**.
3. The address should look like this:

   ```
   https://ewr1.vultrobjects.com/shipcheck-shots-ab12/shots/<audit-id>/1.jpg
   ```

4. Paste it into a new browser tab.
5. In the Vultr console, open the bucket. You should see a `shots/` folder with files
   in it.

✅ **Done** when the image opens from that address and the files are in the bucket.

### If the image does not open

- **The files are not in the bucket at all** → the API is not getting the four
  variables, or `STORAGE_DRIVER` is still `local`. Check
  `docker compose logs api` for upload errors.
- **The files are in the bucket but the URL gives "Access Denied" / 403** → the bucket
  policy from step 4 was not applied, or it has the wrong bucket name in
  `"Resource"`. Re-run step 4 and check `s3cmd info`.
- **403 even with the policy applied, but this address works:**

  ```
  https://shipcheck-shots-ab12.ewr1.vultrobjects.com/shots/<audit-id>/1.jpg
  ```

  …then this storage serves the bucket-first address style instead of the one our
  code builds. **Tell Dev2 (backend).** It is a one-line change in
  `apps/api/src/storage/s3.js` and needs no change on your side.

---

## Common mistakes

| Problem | Cause and fix |
|---|---|
| Uploads fail with a signature or checksum error | `S3_HOSTNAME` contains `https://`. Remove it. |
| API will not start, complains about the four values | One is empty in `.env`, or the api container is not reading `.env`. |
| Images are broken in the report, but files exist in the bucket | The bucket policy from step 4 is missing. |
| Screenshots missing and no error anywhere | `STORAGE_DRIVER` is still `local`. |
| Report shows images but the bucket is empty | The bucket name in `.env` does not match the real bucket name. They must be identical, including the random characters. |
| Bucket creation is rejected | The name has a capital letter, a space or an underscore. Lowercase letters, numbers and hyphens only. |
| Screenshots disappear after a while | The `Archive` tier was selected. Create a `Standard` subscription instead. |

---

## Keep the secret key secret

- Never paste the secret key into Slack, WhatsApp, email or a Jira ticket.
- Never put it in a file that git tracks. `.env` is already in `.gitignore`, and
  `.env.example` must keep its empty placeholders.
- Nobody else on the team needs it. Only the VM needs it, and you are the one who
  edits the VM's `.env`.

If the key is ever exposed, use **Regenerate Keys** in the console and update `.env`
and `~/.s3cfg`. Regenerating immediately invalidates the old key, so change `.env`
right away.

---

## If you would rather not set this up

There is a documented fallback: set `STORAGE_DRIVER=local` in the production `.env`
and the API serves the screenshots itself. Everything works; the screenshots just
come from our own server instead.

The only cost is on the submission form — we then remove **Object Storage** from the
"Vultr services used" list and are using one fewer Vultr service. Since the credits
cover it and the setup is short, doing it properly is worth it.

---

## After the results are announced

Object Storage keeps billing for as long as it exists, so during teardown:

1. Empty the bucket, then delete it.
2. Delete the Object Storage subscription itself.

Destroying the VM does **not** remove the storage. It has to be deleted separately.
