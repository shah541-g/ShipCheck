---
name: vultr-serverless-inference
description: "Provision and use Vultr Serverless Inference (the OpenAI-compatible LLM API at api.vultrinference.com/v1, required for Challenge 1 agent LLM calls). Use when creating an inference subscription via Console/API/CLI, wiring an inference API key into the backend, choosing models, or distinguishing the Vultr account API key from the inference key. Always check the live API reference https://api.vultrinference.com/docs for endpoints and models."
---

# Provisioning Vultr Serverless Inference

> Source: Vultr Docs, "How to Provision Vultr Serverless Inference" (updated 23 Oct 2026), https://docs.vultr.com/products/compute/serverless-inference/provisioning. For the inference API itself (chat completions, models, etc.) see https://api.vultrinference.com/docs.

A Serverless Inference **subscription** hosts Generative AI models with automatic scaling. Vultr says it delivers low latency across six continents and meets security and data compliance requirements. Creating a subscription gives you the API key used to call the OpenAI-compatible endpoint at `https://api.vultrinference.com/v1`.

There are three ways to provision one.

## 1. Vultr Console

1. Go to **Products → Serverless → Inference**.
2. Click **Add Serverless Inference**.
3. Enter a **Label**, acknowledge the supported-models list and the charges note, then click **Add Serverless Inference**.

## 2. Vultr API

The account-level Vultr API (`api.vultr.com/v2`) needs a **Vultr account API key**. This is a different key from the inference subscription key.

Create a subscription:

```bash
curl "https://api.vultr.com/v2/inference" \
    -X POST \
    -H "Authorization: Bearer ${VULTR_API_KEY}" \
    -H "Content-Type: application/json" \
    --data '{
        "label" : "example-inference"
    }'
```

List subscriptions:

```bash
curl "https://api.vultr.com/v2/inference" \
    -X GET \
    -H "Authorization: Bearer ${VULTR_API_KEY}"
```

## 3. Vultr CLI

```bash
vultr-cli inference create --label example-inference   # create a subscription
vultr-cli inference list                               # list subscriptions
```

## Notes for the project

- **Two keys, two hosts:**
  - **Account API key** (`VULTR_API_KEY`) → `api.vultr.com/v2`. Manages infrastructure: subscriptions, instances.
  - **Inference subscription key** → `api.vultrinference.com/v1`. Used for model calls.
- Keep both keys on the control plane only, **never inside the sandbox**. This is the Challenge 1 secret-hygiene requirement.

## How ShipCheck uses it (build steps 1.7, 1.12 and 5.1)

- **Key:** Vultr console → **Serverless** → **Inference** → copy the key into `LLM_API_KEY`. It is used **only** by the api (the control plane), never by the sandbox.
- **Env vars:** `LLM_BASE_URL=https://api.vultrinference.com/v1`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_VISION_MODEL` (optional), `LLM_JSON_MODE`, `LLM_TIMEOUT_MS=60000`. The `openai` npm client points at `LLM_BASE_URL`.
- **List the models:**
  ```bash
  curl -s https://api.vultrinference.com/v1/models -H "Authorization: Bearer <LLM_API_KEY>"
  ```
- **Choose the model with `apps/api/scripts/llm-smoke.js`** (Step 1.12). Run it with `node --env-file=.env.development scripts/llm-smoke.js` from `apps/api`.
  1. `LLM_MODEL`: the largest instruct/chat model (names with `70b`, `120b`, `instruct`, `kimi`, `qwen`, `llama`, `gpt-oss`).
  2. `LLM_JSON_MODE`: `true` if the `json_mode=true` line printed valid JSON; `false` if only `json_mode=false` did; otherwise try the next model.
  3. **The action test must print one clean action object**, e.g. `{"action":"click","n":2,...}`. The explorer depends on it.
  4. Vision: if a `vision` / `vl` / `llava` / `pixtral` / `gemma-3` model answers "red" to the 1-pixel test, set `LLM_VISION_MODEL`; otherwise leave it empty (Stretch S5).
- **Speed:** the explorer makes one AI call per action (up to 40 per audit), and they must all fit in `EXPLORE_TIMEOUT_MS=420000`. If the model is too slow, lower `MAX_ACTIONS_PER_AUDIT` / `MAX_JOURNEYS` or pick a faster model.
- **Fail-soft:** if the AI is down or the key is wrong, the report is still produced, with journeys marked "not run" (Phase 8, row 11).
- **Practice keys** (Gemini, Groq) are allowed only before kickoff. The final build must call Vultr.