# Loops Routes

Routes for managing "Open Loops" — conversations flagged as unresolved by the summary system.

## GET /api/loops

Returns all open loops (conversations where `resolved === false` and snooze has expired).

### Query Parameters
- `projectId` (optional): Filter by project ID (e.g. `project-123`).
- `intent` (optional): Filter by intent (e.g. `CODING`).
- `age` (optional): Filter to loops older than N days (`daysSinceCreated >= N`).

### Response
```json
{
  "loops": [
    {
      "conversationId": "abc-123",
      "title": "Refactoring auth",
      "goal": "Implement JWT rotation",
      "projectId": "project-456",
      "projectName": "Auth Service",
      "intent": "CODING",
      "topics": ["auth", "jwt", "refactor"],
      "createdAt": "2026-05-01T14:00:00Z",
      "summarizedAt": "2026-05-01T18:00:00Z",
      "daysSinceCreated": 5,
      "snoozedUntil": null
    }
  ],
  "total": 1
}
```

## POST /api/loops/:conversationId/snooze

Snoozes a loop until a specific date.

### Request Body
```json
{
  "snoozedUntil": "2026-05-15"
}
```
*Format must be YYYY-MM-DD (UTC).*

### Response
```json
{ "ok": true }
```

## POST /api/loops/:conversationId/resolve

Manually marks a loop as resolved. Clears `snoozedUntil` and sets `resolved: true` and `resolvedAt` in `meta.json`.

### Response
```json
{ "ok": true }
```

## POST /api/loops/:conversationId/todo

Creates a new to-do item from the loop's goal and title.

### Response
```json
{
  "todo": {
    "id": "todo-789",
    "text": "Implement JWT rotation",
    "priority": "soon",
    "status": "open",
    ...
  }
}
```
