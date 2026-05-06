# AI Router

`server/src/services/aiRouter.ts`

## Intent-Based Routing

Rather than a single global priority list, the router selects providers based on the **intent** of each message. The user picks an intent from the UI (or the client auto-detects one via `detectIntent()`); the server then walks the corresponding tier list until a provider succeeds.

### Intent Fallback Matrix

| Intent | T1 | T2 | T3 |
|---|---|---|---|
| `WEB_SEARCH` | Gemini 2.5 Flash (search) | Gemini 2.5 Pro (search) | OR: GPT-oss-120b |
| `CODING` | NVIDIA: Llama 3.3 70B | Groq: Llama 3.3 70B | Gemini 2.5 Pro |
| `DEBUGGING` | Groq: Llama 3.3 70B | Gemini 2.5 Flash | OR: Laguna M.1 |
| `TRANSLATING` | OR: GPT-oss-120b | Gemini 2.5 Pro | Groq: Llama 3.3 70B |
| `DRAFTING` | Groq: Llama 3.3 70B | Gemini 2.5 Flash | NVIDIA: Llama 3.1 70B |
| `SUMMARIZING` | Gemini 2.5 Flash | Groq: Llama 3.3 70B | OR: Llama 3.2 3B |
| `IMAGE_ANALYSIS` | Gemini 2.5 Flash (vision) | Gemini 2.5 Pro (vision) | OR: GPT-oss-120b (vision) |

A tier is skipped if its provider's API key is missing or its daily quota is exhausted. The label appended to the response includes `(Fallback)` for any tier beyond T1.

## Providers

| Key | Daily limit env var | Default |
|---|---|---|
| `groq-chat` | `GROQ_CHAT_DAILY_LIMIT` | 1,000 |
| `gemini` | `GEMINI_DAILY_LIMIT` | 1,500 |
| `openrouter` | `OPENROUTER_DAILY_LIMIT` | 200 |
| `nvidia` | `NVIDIA_DAILY_LIMIT` | 1,000 |

## Vision Routing

Only tiers explicitly marked `vision: true` receive image attachments. When `hasImages=true` the router skips non-vision tiers for all intents except `IMAGE_ANALYSIS` (which always uses vision-capable models). If no vision tier is available the request fails with `QUOTA_EXCEEDED`.

## User Memory Injection

By default (`injectMemory=true`) the router prepends a `system` message containing `data/user-memory.md` to every outgoing message list before routing. This keeps long-term user context available to all providers without changing any call sites.

## Summarization

`summarize()` routes nvidia → gemini → groq-chat → openrouter, skipping any provider that is over quota or missing a key. This separate path preserves chat quotas and avoids routing summarization through search-enabled models.

## Usage Tracking

Counters live in `data/usage.json` keyed by provider and `YYYY-MM-DD`. Usage is incremented only on the first token received (not on request start), so failed calls before yielding don't count.

If a provider returns HTTP 402 or 403 (billing cap / hard key limit), the router auto-exhausts that provider's daily counter so all subsequent requests skip it immediately.

## Limits Configuration

All daily limits are read from environment variables (see `.env.example`). Defaults reflect free-tier quotas at the time of writing.
