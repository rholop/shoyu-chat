# Summary Service

The `summaryService` manages the automatic summarization of conversations after a period of inactivity.

## How it works
1. When a message is appended, a 4-hour timer is scheduled via `schedule(conversationId)`.
2. If another message arrives, the timer resets.
3. Upon expiry, `runSummary(conversationId)` is executed.

## Execution Steps
`runSummary` performs the following in order:
1. **Resolution Analysis**: AI determines if the goal was met and writes a 2-4 sentence summary. Updates `meta.json`.
2. **Topic Extraction**: AI identifies 3-6 specific topics.
3. **Markdown Generation**: Writes a formatted `.md` file to `data/chats/`.
4. **Weekly Log Update**: Appends a one-liner to the weekly summary.
5. **Monthly Summary**: Regenerates the overview for the current month.
6. **Memory Update**: Updates the global user memory with facts from the conversation.
7. **Project Summary**: If linked to a project, regenerates the project's `summary.md`.
8. **Ledger Append**: Appends an entry to the `topic-ledger.jsonl` for pattern analysis.
9. **Todo Extraction**: Calls `todoService.extractAndSave()` to identify actionable tasks.

## Recovery
On server boot, `recoverSummaryTimers()` finds conversations active within the last 4 hours and re-schedules their summaries.

## Manual Flush
`flushAllPending()` can be called to immediately run all pending summaries (e.g., during a graceful shutdown).
