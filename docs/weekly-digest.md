# Weekly Digest

A weekly automated email report covering usage, projects, and AI-generated insights.

## Schedule

- **Cron:** `59 23 * * 0` (Sunday at 11:59 PM EST).

## Job Flow

1. **Flush Summaries:** Immediately run any pending 4-hour inactivity summaries.
2. **Data Aggregation:** Read weekly logs, monthly overviews, and project summaries.
3. **AI Insight Generation:** Pass the aggregated summaries to a model to generate:
   - Recurring themes and patterns.
   - Project progress reports.
   - 3-5 new project ideas inspired by the week's work.
4. **Rendering:** Generate a styled HTML email using the collected data.
5. **Delivery:** Send via the **Resend** API to the configured email address.

## Sections

- **Week at a Glance:** Stats on message counts, models used, and files handled.
- **Weekly Summary:** The chronological table of conversations.
- **Project Progress:** Recent updates for each active project.
- **AI Insights:** High-level analysis of what was learned or built.
- **New Project Ideas:** Concrete suggestions for future exploration.
