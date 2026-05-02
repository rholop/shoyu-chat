# AI Router

`server/src/services/aiRouter.ts`

## Provider Priority

| Priority | Key | Model | Daily limit | Vision |
|---|---|---|---|---|
| 1 | `groq-compound` | `groq/compound` | 250 | No |
| 2 | `groq-chat` | `llama-3.3-70b-versatile` | 1,000 | No |
| 3 | `gemini` | `gemini-2.0-flash` | 1,500 | Yes |
| 4 | `openrouter` | `meta-llama/llama-3.1-8b-instruct:free` | 200 | No |

## Vision Routing

When a message includes image attachments (`hasImages=true`), non-vision providers are skipped. Only Gemini handles images natively. If Gemini is also over quota, the request fails with `QUOTA_EXCEEDED`.

## Summarization

`summarize()` skips `groq-compound` (preserving its 250/day budget for chat) and routes groq-chat → gemini → openrouter.

## Usage Tracking

Counters are stored in `data/usage.json` keyed by provider and YYYY-MM-DD date. Usage is incremented on the first token received from a provider (not before), so failed requests before yielding don't count.

## Limits Configuration

All limits are read from environment variables (see `.env.example`). Defaults match the free-tier quotas at the time of writing.
