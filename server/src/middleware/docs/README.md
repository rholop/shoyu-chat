# Middleware

| File | Purpose |
|---|---|
| `authMiddleware.ts` | Validates JWT cookie; attaches `req.user` or returns 401 |
| `uploadMiddleware.ts` | multer disk-storage setup for `POST /api/files/upload`; validates MIME type and size |
| `errorHandler.ts` | Global Express error handler — logs and returns 500 JSON |

## Auth Middleware

Reads the `token` httpOnly cookie. Verifies with `JWT_SECRET`. On success, attaches `{ userId, username }` to `req.user` and calls `next()`. All `/api/*` routes except `/api/auth/*` are wrapped with this middleware.

## Upload Middleware

Stores files to `$DATA_DIR/conversations/{conversationId}/{uuid}-{filename}`. The `conversationId` must be present in `req.body` (sent as a multipart field). Files exceeding `MAX_FILE_SIZE_MB` or with disallowed MIME types are rejected with a 400 error before writing to disk.
