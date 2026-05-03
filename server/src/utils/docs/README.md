# Utils

Stateless helper functions and application-wide utilities.

| File | Purpose |
|---|---|
| `dateHelpers.ts` | Formatting for ISO weeks, months, and human-readable date ranges for summaries. |
| `logger.ts` | Standardized logging with timestamps and environment-aware debug levels. |

## dateHelpers

- `getToday()`: Current date in `YYYY-MM-DD`.
- `getISOWeekKey()`: Current week for markdown file naming (e.g., `2026-W18`).
- `getMonthKey()`: Current month for directory and file naming.

## logger

- Wraps console methods with ISO timestamps.
- `debug` messages are suppressed when `NODE_ENV=production`.
