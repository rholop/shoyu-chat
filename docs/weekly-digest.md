# Weekly Digest

## Schedule

Cron expression: `59 23 * * 0` — Sunday at 11:59 PM in the `TZ` timezone (default `America/New_York`).

## Job Steps

1. Flush any pending unsummarized conversations immediately (`flushAllPending`)
2. Read `data/summaries/YYYY-WXX.md` (current week)
3. Read `data/summaries/YYYY-MM.md` (current month)
4. Call `aiRouter.summarize()` with the digest prompt to generate AI insights
5. Render and send the HTML email via Resend

## Email Sections

1. **This Week** — rendered weekly markdown table
2. **Monthly Themes** — rendered monthly overview
3. **AI Insights & Ideas** — AI-generated trends + 3–5 project ideas

Sender: `EMAIL_FROM` env var (default `noreply@holop.dev`)
Recipient: `EMAIL_TO` env var

## Manual Trigger

`POST /api/admin/digest/trigger` (requires auth) runs the job immediately. Useful for testing without waiting for Sunday.
