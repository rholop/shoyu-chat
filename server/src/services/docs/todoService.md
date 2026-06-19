# todoService

Extracts actionable to-do items from conversations using an AI summarization call and persists them to `todos.json` per conversation.

## Merge, never overwrite

`extractAndSave()` is called every time a conversation goes idle (see `summaryService`), which can happen more than once for the same conversation (multi-day/multi-session conversations). Each run:

1. Loads the conversation's existing todos first and never mutates or removes them — any user edits (status, text, due date, etc.) survive re-extraction.
2. Builds a dedup context from existing todos in the same conversation, plus (if the conversation belongs to a project) existing todos anywhere in that project, of any status. This list is both passed to the AI prompt (asking it not to repeat them) and used as a programmatic backstop (`isDuplicateTodoText`, a normalized text-overlap check) to drop near-duplicate candidates the model returns anyway.
3. Appends only genuinely new candidates to the existing array and writes the merged result.

On AI failure or when a conversation has no non-internal messages, the function returns the existing todos untouched and does **not** write an empty array over the file.

## Snooze lifecycle

`wakeSnoozedTodos()` scans all todos and flips any `status: 'snoozed'` todo whose `snoozedUntil` has passed back to `status: 'open'` (clearing `snoozedUntil`). It's run on a daily cron and once at server startup (see `jobs/todoMaintenance.ts`) so snoozing actually hides an item until its wake date instead of being purely cosmetic.

## New Fields on `Todo`

In addition to the original fields, each `Todo` now carries:

| Field | Type | Description |
|---|---|---|
| `calendarStatus` | `'pending' \| 'published'` | Derived from `dueDate`. Never set directly by client. |
| `startTime` | `string \| null` | HH:MM (24hr). If null, event is all-day. |
| `endTime` | `string \| null` | HH:MM (24hr). Defaults to startTime + 1 hour in ICS generation. |
| `location` | `string \| null` | Free text location (e.g. "Zoom" or "123 Main St"). |
| `url` | `string \| null` | URL associated with the event. |
| `notes` | `string \| null` | Longer description / notes. |
| `alarms` | `TodoAlarm[]` | Array of reminders. Empty by default. |
| `recurrence` | `TodoRecurrence \| null` | Recurrence rule. null = no recurrence. |
| `allDay` | `boolean` | True = all-day event. False = timed event. Default: true. |

## Default Values on Creation

In `extractAndSave()`, new todos are created with:

```typescript
calendarStatus: item.dueDate ? 'published' : 'pending',
startTime: null,
endTime: null,
location: null,
url: null,
notes: null,
alarms: [],
recurrence: null,
allDay: true,
```

If the AI extracted a `dueDate`, `calendarStatus` is `'published'` immediately. Otherwise `'pending'`.

## Auto-Publish Logic in `updateTodo()`

`calendarStatus` is always derived — never directly set by the client:

- When `dueDate` is set to a non-null value AND `calendarStatus === 'pending'` → auto-set to `'published'`
- When `dueDate` is cleared to null AND `calendarStatus === 'published'` → auto-set to `'pending'`
- If client sends `calendarStatus` in updates, it is ignored (not in `TodoUpdateFields`)

## `TodoUpdateFields`

The type of the `updates` argument to `updateTodo()`. Includes:

```typescript
export type TodoUpdateFields = Partial<Pick<Todo,
  | 'status' | 'priority' | 'text' | 'dueDate'
  | 'startTime' | 'endTime' | 'location' | 'url' | 'notes'
  | 'alarms' | 'recurrence' | 'allDay'
>>;
```

**Excluded** (not directly patchable via this type):
- `calendarStatus` — derived from `dueDate`
- `snoozedUntil` — managed by the snooze route, passed separately

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
