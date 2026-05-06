# Types

Shared TypeScript interfaces and enums for the client (`client/src/types/index.ts`).

| Type | Description |
|---|---|
| `User` | `{ userId, username, email? }` — JWT payload shape |
| `Attachment` | `{ fileId, filename, mimeType, size? }` — uploaded file reference |
| `Message` | Single chat message with optional `attachments`, `model_used`, and `intent` |
| `Conversation` | Metadata summary including `projectId`, `model_last_used`, and `has_files` |
| `ConversationWithMessages` | `Conversation & { messages: Message[] }` — returned by `GET /api/conversations/:id` |
| `Project` | `{ id, name, description, created_at, conversationCount }` — list item |
| `ProjectDetail` | Full project including `contextDoc`, `summary`, and `conversations[]` |
| `Intent` | Enum of routing intents: `WEB_SEARCH`, `CODING`, `DEBUGGING`, `TRANSLATING`, `DRAFTING`, `SUMMARIZING`, `IMAGE_ANALYSIS` |
| `IntentConfig` | `{ label, icon, description }` — display metadata per intent |
| `INTENT_CONFIG` | `Record<Intent, IntentConfig>` — maps each intent to its UI label, icon, and description |
| `INTENT_MODEL_LABELS` | `Record<string, string>` — maps raw model/provider strings from SSE to human-readable badge labels |
| `SSEEvent` | Discriminated union: `token` \| `done` (includes `intent`) \| `error` — emitted by `sendMessage` generator |
