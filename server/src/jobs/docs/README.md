# Jobs

Scheduled background tasks.

| File | Purpose |
|---|---|
| `weeklyDigest.ts` | Cron job — Sunday 11:59 PM; flushes pending summaries, generates AI insights, sends HTML email |

## Weekly Digest

`scheduleWeeklyDigest()` registers a `node-cron` task (expression `59 23 * * 0`) in the `TZ` timezone (default `America/New_York`).

When the job fires it calls `sendWeeklyDigest()`:

1. `flushAllPending()` — runs any outstanding inactivity-debounce summaries immediately
2. Reads `data/summaries/YYYY-WXX.md` and `data/summaries/YYYY-MM.md`
3. Calls `aiRouter.summarize()` to generate an insights + project-ideas paragraph
4. Calls `sendWeeklyDigestEmail()` with the assembled content

`POST /api/admin/digest/trigger` (auth-protected) runs `sendWeeklyDigest()` on demand for testing.
