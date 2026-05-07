# Suggestions API

The suggestions API handles retrieval, conversion, and dismissal of project suggestions.

## Auth
All routes require authentication via `requireAuth` middleware.

## Routes

### `GET /api/suggestions/projects`
Returns a list of current project suggestions based on topic ledger analysis.

**Response:**
```json
{
  "suggestions": [
    {
      "topic": "TypeScript",
      "conversationCount": 12,
      "weekCount": 4,
      "firstSeen": "2024-01-01",
      "lastSeen": "2024-01-20",
      "relatedGoals": ["Set up ts-node", "Fix compiler errors"],
      "relatedConversationIds": ["conversation-uuid-1"]
    }
  ]
}
```

### `POST /api/suggestions/projects/create`
Converts a suggestion into a formal project. Triggers an AI call to generate the project context document.

**Request:**
```json
{
  "topic": "TypeScript"
}
```

**Response:**
```json
{
  "projectId": "new-project-uuid"
}
```

### `POST /api/suggestions/projects/dismiss`
Permanently dismisses a topic so it no longer appears in suggestions.

**Request:**
```json
{
  "topic": "TypeScript"
}
```

**Response:**
```json
{
  "ok": true
}
```
