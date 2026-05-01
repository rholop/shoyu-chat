# Utils

Stateless helper functions.

| File | Purpose |
|---|---|
| `dateHelpers.ts` | ISO week key, month key, human-readable range labels |
| `logger.ts` | Thin console wrapper with ISO timestamps; `debug` suppressed in production |

## dateHelpers

| Export | Returns | Example |
|---|---|---|
| `getISOWeekKey()` | `YYYY-WXX` | `2026-W18` |
| `getMonthKey()` | `YYYY-MM` | `2026-05` |
| `getWeekRangeLabel()` | `"Apr 27 – May 3"` | human-readable |
| `getMonthLabel(date)` | `"May 2026"` | for monthly file headers |

## logger

```ts
logger.info(...)   // console.log  with [ISO] INFO prefix
logger.warn(...)   // console.warn with [ISO] WARN prefix
logger.error(...) // console.error with [ISO] ERROR prefix
logger.debug(...) // console.debug with [ISO] DEBUG prefix — no-op in production
```
