# To-Do API Routes

All routes under `/api/todos` require authentication via JWT cookie.

## GET /api/todos

Returns all open to-dos across all conversations.

**Response:**
```json
{
  "todos": [
    {
      "id": "todo-...",
      "conversationId": "conversation-...",
      "text": "Fix the bug",
      "priority": "now",
      "status": "open",
      "createdAt": "2026-05-01T10:00:00Z",
      ...
    }
  ]
}
```

**Sort Order:**
1. Priority: `now` > `soon` > `someday`
2. `createdAt` descending within each priority group.

## GET /api/todos/conversation/:conversationId

Returns all to-dos (any status) for a specific conversation.

**Response:**
```json
{
  "todos": [...]
}
```

## PATCH /api/todos/:conversationId/:todoId

Updates a single to-do.

**Patchable Fields:**
- `status` ('open' | 'done' | 'snoozed')
- `priority` ('now' | 'soon' | 'someday')
- `dueDate` (YYYY-MM-DD or null) — setting auto-publishes, clearing auto-unpublishes
- `snoozedUntil` (YYYY-MM-DD or null)
- `text` (string, max 120 chars)
- `startTime` (HH:MM or null)
- `endTime` (HH:MM or null)
- `location` (string or null)
- `url` (valid URL string or null)
- `notes` (string or null)
- `alarms` (array of `TodoAlarm` objects)
- `recurrence` (`TodoRecurrence` object or null)
- `allDay` (boolean)

**Not patchable directly:**
- `calendarStatus` — derived from `dueDate`, ignored if sent

**Validation rules for new fields:**
- `startTime` / `endTime`: must match `HH:MM` or be null
- `url`: must be a valid URL (passes `new URL()`) or null
- `alarms[].trigger`: must be a negative integer
- `alarms[].action`: must be `'DISPLAY'` or `'EMAIL'`
- `recurrence.frequency`: must be `'DAILY'`, `'WEEKLY'`, `'MONTHLY'`, or `'YEARLY'`
- `recurrence.interval`: must be a positive integer (≥ 1)

**Request Body:**
```json
{
  "status": "done"
}
```

**Response:**
```json
{
  "todo": { ...updated todo... }
}
```

## DELETE /api/todos/:conversationId/:todoId

Permanently deletes a to-do from storage.

**Response:**
```json
{
  "ok": true
}
```

## GET /api/todos/export.ics

Exports all open to-dos as a single `.ics` (iCalendar) file.

**Response:**
- `Content-Type: text/calendar; charset=utf-8`
- `Content-Disposition: attachment; filename="shoyu-todos.ics"`
- Body: Valid iCalendar content.

**Error:**
- Returns 404 if there are no open to-dos to export.

## GET /api/todos/:conversationId/:todoId/export.ics

Exports a single to-do as an `.ics` file.

**Response:**
- `Content-Type: text/calendar; charset=utf-8`
- `Content-Disposition: attachment; filename="{safe-todo-text}.ics"`
- Body: Valid iCalendar content containing one event.

**Error:**
- Returns 404 if the to-do is not found.
