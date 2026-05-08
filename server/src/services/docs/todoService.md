# todoService

Extracts actionable to-do items from conversations using an AI summarization call and persists them to `todos.json` per conversation.

## Date Extraction

When extracting to-dos, the service resolves date references in the conversation to absolute `YYYY-MM-DD` values stored in the `dueDate` field.

### Anchor date

The AI uses the `created_at` timestamp of the last non-internal message in the conversation as the "today" anchor when resolving relative references like "by Friday" or "next week". This ensures dates are resolved relative to when the conversation actually took place, not when extraction runs.

- Internal messages (role `"internal"`) are excluded when finding the last message.
- Fallback: if no message has a `created_at` field, today's UTC date is used.

### Relative reference resolution

The AI prompt instructs the model to resolve references such as:

- `"by Friday"` → next Friday on or after the anchor date
- `"next week"` → Monday of the following week
- `"by end of month"` → last day of the current month
- `"May 15th"` or `"the 15th"` → absolute date in the anchor month/year
- `"tomorrow"` → anchor date + 1 day
- `"in two weeks"` → anchor date + 14 days

### Validation in `parseTodoResponse`

After the AI returns a response, `parseTodoResponse` validates each `dueDate` field:

1. Must be a `string` (not null, number, or object).
2. Must match the `YYYY-MM-DD` regex (`/^\d{4}-\d{2}-\d{2}$/`).
3. Must not be earlier than the anchor date (`dueDate >= anchorDate`). Same-day dates are valid.

If any validation step fails, `dueDate` is set to `null`. The todo item itself is **not** discarded — only `dueDate` is nulled.

The AI is explicitly instructed not to invent dates. When no date is mentioned or the AI is unsure, it returns `null`, which passes through unchanged.
