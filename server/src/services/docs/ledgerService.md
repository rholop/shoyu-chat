# ledgerService

Maintains `data/insights/topic-ledger.jsonl` — an append-only record of every summarized conversation. It piggybacks on the existing 4-hour inactivity summarization run with zero extra AI calls.

## File format

One JSON object per line (`LedgerEntry`). Never rewritten, only appended.

```jsonl
{"date":"2026-04-20","conversationId":"conversation-abc123","topics":["auth","JWT","Express"],"goal":"Debugged JWT expiry issue in Express middleware.","intent":"DEBUGGING","projectId":"project-xyz789","projectName":"My Project","model":"groq-chat","messageCount":14,"resolved":null}
```

| Field | Type | Source |
|---|---|---|
| `date` | `string` | `meta.json` → `created_at` (YYYY-MM-DD) |
| `conversationId` | `string` | `conversation-{id}` |
| `topics` | `string[]` | Parsed from `## Topics` section of the chat markdown |
| `goal` | `string` | First sentence of `## Summary` section |
| `intent` | `string` | Most common intent found in internal messages |
| `projectId` | `string\|null` | `project-{id}` or null |
| `projectName` | `string\|null` | From `project-{id}/meta.json` |
| `model` | `string` | Most common model label across non-internal messages |
| `messageCount` | `number` | Count of non-internal messages |
| `resolved` | `boolean\|null` | Always null in iteration 1; populated by iteration 3 |

## API

### `append(conversationId: string): Promise<void>`

Builds and appends one ledger entry. Called at the end of `summaryService.runSummary()`. Reads the already-written chat markdown file — no extra AI call. Errors are caught and logged; never throws.

### `readAll(): Promise<LedgerEntry[]>`

Reads and parses the full ledger. Returns `[]` if the file does not exist. Skips malformed lines with a warning.

### `readSince(date: string): Promise<LedgerEntry[]>`

Returns entries whose `date` is on or after the given YYYY-MM-DD string.

### `getTopicFrequency(entries: LedgerEntry[]): Map<string, number>`

Returns a `Map` of topic → count sorted descending. Used by pattern detection (iteration 2).

### `getByProject(entries: LedgerEntry[], projectId: string): LedgerEntry[]`

Filters entries by `projectId` (must be the full `project-{id}` string).

## Design notes

- Append-only with `fs.appendFile` — safe for single-user use, no locking needed.
- Topics and goal are parsed from the markdown written by `writeChatFile()` using simple line-splitting — no regex complexity, no second AI call.
- The `insights/` directory is created on first write if missing.
- This file is the primary data source for all subsequent insight features (pattern detection, weekly digest enrichment, resolution tracking).
