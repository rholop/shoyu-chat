# Jobs

Scheduled tasks and automated background processes.

| File | Purpose |
|---|---|
| `weeklyDigest.ts` | Orchestrates the Sunday night email summary run. |

## weeklyDigest

- Triggered via `node-cron`.
- Aggregates data from `data/summaries/` and `data/project-*/`.
- Uses `aiRouter.summarize` to generate creative insights and project ideas.
- Sends the final report via `emailService`.
