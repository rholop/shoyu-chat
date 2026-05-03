# Middleware

Express middleware for request processing, authentication, and error handling.

| File | Purpose |
|---|---|
| `authMiddleware.ts` | Validates JWT from `httpOnly` cookies and populates `req.user`. |
| `uploadMiddleware.ts` | Handles multipart file uploads using `multer`, enforcing size and type limits. |
| `errorHandler.ts` | Global catch-all for API errors, providing consistent JSON error responses. |

## uploadMiddleware

- Saves files to `conversation-{id}/uploads/`.
- Validates against `ALLOWED_FILE_TYPES` in `.env`.
- Enforces `MAX_FILE_SIZE_MB`.
