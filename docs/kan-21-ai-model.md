# KAN-21 — the AI model and its settings

One place for the AI settings the whole team shares, and for how to check them.

## The settings

```
LLM_PROVIDER=vultr
LLM_BASE_URL=https://api.vultrinference.com/v1
LLM_MODEL=glm-5.3
LLM_JSON_MODE=true
LLM_VISION_MODEL=            # empty on purpose
LLM_TIMEOUT_MS=60000
```

They are the same in `.env.example` (deployment) and `apps/api/.env.development.example`
(local). `LLM_API_KEY` is never committed: each of us pastes our own Vultr inference key
into the git-ignored `apps/api/.env.development`.

## Why these values

**Vultr Serverless Inference, in development too.** The hackathon requires that the AI
calls go to Vultr, and a model only behaves the way you tested it on the endpoint you
tested it on. JSON mode, the think-section wrapping and the single-action discipline all
differ between providers, so developing against one provider and demoing on another would
mean the demo runs on an untested path. The development template therefore points at
Vultr as well, and `resolveLlmConfig` in `apps/api/src/config.js` defaults to `vultr`, so
an environment that forgets to name a provider cannot quietly use something else.

Another OpenAI-compatible endpoint can still be selected locally with `LLM_PROVIDER` and
`LLM_BASE_URL` — that is for debugging without burning credits, not for the demo.

**`glm-5.3`** is the chat model. `scripts/llm-smoke.js` was run against a Vultr inference
key twice: by Dev4 when the model was chosen, and again on 6 Nov against these committed
settings. Both times the model listed, answered in JSON with `json_mode` both on and off,
and returned one clean Core action — `{"action":"click","n":2,"reason":"..."}`, the right
element number and no invented keys. That last part is what matters: the explorer asks for
exactly one action per turn, and anything that chats around the JSON, or that adds its own
keys, is rejected by the guard and wastes a step.

The account's catalogue at that point held 35 models. `glm-5.2`, `glm-5.3` and
`glm-5.3-flash` were all offered; the rest were embedding, reranker, speech, image and
video models, which the explorer cannot use.

**`LLM_JSON_MODE=true`**, because the `json_mode=true` run returned valid JSON. We keep
response_format on where the model supports it; `apps/api/src/llm/json.js` still extracts
the object and retries once, so a model that ignores the flag is not fatal.

**`LLM_VISION_MODEL` stays empty.** The visual check is Stretch. An empty value turns it
off, and nothing in Core reads it.

## If `glm-5.3` is not available on your key

The catalogue changes, and it differs per account. Do not guess an ID — list them:

```bash
cd apps/api
node --env-file=.env.development scripts/llm-smoke.js
```

With no model set, that prints the model list. With a model set, it also checks that the
ID is in your account's list before it makes any chat call, so a stale ID gives you a
clear message instead of a 404.

Try a candidate without editing the env file by passing it as an argument:

```bash
node --env-file=.env.development scripts/llm-smoke.js deepseek-v4.1-flash
```

Pick the first one from your own list, in this order of preference, that passes:

1. a `glm-5.x` instruct model
2. `deepseek-v4.x` (the flash variants are cheapest and have been fine for structured JSON)
3. a `qwen3.x` instruct model
4. `minimax-m3`

Prefer the larger instruct/chat model, and skip embedding, reranker, speech, image and
video models — the list contains those too. Then tell the team the ID you settled on, and
update this file and both env templates in the same commit.

## What "passed" means

The smoke test must print all three of these:

- a model list that contains your `LLM_MODEL`
- `json_mode=true: { ok: true, pages: [ 'https://example.com/' ] } (valid)`
- `action test: {"action":"click","n":2,"reason":"..."}` — one object, no prose, no extra keys

If the action test fails or needs several attempts, change the model rather than loosening
the prompt. The explorer's guard rejects anything that is not one of the six contracted
shapes, so a model that cannot hold the shape just produces blocked actions.
