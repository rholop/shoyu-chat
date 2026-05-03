# File Upload System

shoyu-chat allows users to upload files and images as conversation context.

## Upload Flow

1. User attaches file(s) via the UI.
2. Client uploads to `POST /api/files/upload`.
3. Server saves to `conversation-{id}/uploads/` with a unique UUID prefix.
4. Client includes `attachmentIds` in the next `POST /api/chat/send` request.

## Processing for AI Context

| File Type | Extraction Method | Injection Format |
|---|---|---|
| **Images** | Base64 encoded | Direct image part (Vision models) |
| **PDFs** | `pdf-parse` (text extraction) | Text block with filename header |
| **Text/Code** | UTF-8 read | Fenced code block with extension hint |
| **JSON/CSV** | UTF-8 read | Formatted text block |

## Context Limits

- **Text Extraction:** Up to 50,000 characters per file.
- **Truncation:** Large files are truncated with a notice injected into the context.

## Lifecycle

- Files are scoped to a specific conversation.
- Deleted recursively when the conversation is deleted.
- No automatic expiry; storage is permanent for the life of the conversation.
