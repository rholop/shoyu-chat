# Utils

Stateless client-side helper functions.

| File | Purpose |
|---|---|
| `detectIntent.ts` | Heuristic intent detection from message text and attachment presence |

## detectIntent

```ts
function detectIntent(content: string, hasImages: boolean): Intent
```

Runs synchronously in the browser with no network calls. Checks patterns in priority order:

1. `IMAGE_ANALYSIS` — if `hasImages` is true, or message contains image-related keywords
2. `WEB_SEARCH` — real-time / current-events patterns ("latest", "today", "search for", etc.)
3. `TRANSLATING` — explicit translation verbs or target language names
4. `SUMMARIZING` — summarize / TL;DR / key points patterns
5. `DRAFTING` — "draft a", "compose a", or "write a `<prose-type>`" patterns
6. `DEBUGGING` — error / fix / crash / exception patterns
7. `CODING` — code keywords, language names, refactor/test patterns
8. Falls back to `CODING` when no pattern matches

The detected intent is sent with each chat request and used by the server to select the appropriate AI provider tier.
