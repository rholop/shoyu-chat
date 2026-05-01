# File Uploads

## Upload Flow

1. User taps the paperclip button (or drags a file on desktop)
2. `POST /api/files/upload` — multipart/form-data with `file` + `conversationId`
3. multer writes to `data/conversations/{conversationId}/{uuid}-{filename}`
4. Server returns `{ fileId, filename, mimeType, size }`
5. Client stores the `Attachment` object and shows an `AttachmentChip`
6. On send, `POST /api/chat/send` includes `attachments: [{ fileId, filename, mimeType, size }]`
7. Server extracts file context and injects it into the AI prompt

## Context Extraction (`fileService.ts`)

| Type | Processing |
|---|---|
| `image/*` | Read as base64; passed as `inlineData` to Gemini |
| `application/pdf` | `pdf-parse` extracts text; injected as fenced block |
| `text/*`, `application/json` | Read as UTF-8; injected as fenced code block with language hint |
| Other | Attempt UTF-8 read; on failure show placeholder message |

Text content is truncated at 50,000 characters with a notice.

## File Lifecycle

- Files are stored in `data/conversations/{id}/` for the lifetime of the conversation.
- Deleting a conversation removes all its uploaded files recursively.
- Files are not shared between conversations.
- `DELETE /api/files/:conversationId/:fileId` removes a single file without modifying the message history (historical attachment references remain in the NDJSON).

## Allowed Types

Controlled by `ALLOWED_FILE_TYPES` env var. Default includes images (JPEG, PNG, GIF, WebP), PDF, and common text/code formats.

## Size Limit

Controlled by `MAX_FILE_SIZE_MB` env var. Default: 20 MB.
