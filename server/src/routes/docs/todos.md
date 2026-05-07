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
- `dueDate` (ISO string or null)
- `snoozedUntil` (ISO string or null)
- `text` (string)

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
