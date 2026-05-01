# Types

Shared TypeScript interfaces for the client.

| Type | Description |
|---|---|
| `User` | `{ userId, username, email? }` — JWT payload shape |
| `Attachment` | `{ fileId, filename, mimeType, size? }` — uploaded file reference |
| `Message` | Single chat message with optional `attachments` and `model_used` |
| `Conversation` | Metadata summary including `model_last_used` and `has_files` |
| `ConversationWithMessages` | `Conversation & { messages: Message[] }` — returned by `GET /api/conversations/:id` |
| `SSEEvent` | Discriminated union: `token` \| `done` \| `error` — emitted by `sendMessage` generator |
