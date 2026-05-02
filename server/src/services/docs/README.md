# Services

Business logic and external integrations.

| File | Purpose |
|---|---|
| `aiRouter.ts` | Routes chat/summarize calls across providers in priority order |
| `groqService.ts` | Groq API — `streamChatGroqCompound` (groq/compound) and `streamChatGroqChat` (llama-3.3-70b-versatile) |
| `geminiService.ts` | Google Gemini API — handles both text and image (vision) inputs |
| `openrouterService.ts` | OpenRouter free-tier fallback |
| `fileService.ts` | Extract AI-usable context from uploaded files (PDF, text, images) |
| `summaryService.ts` | 4-hour inactivity debounce → triggers AI summarization of conversations |
| `markdownService.ts` | Read/write chat files and weekly/monthly summary markdown files |
| `emailService.ts` | Send weekly digest HTML email via Resend |

See `/docs/ai-router.md` and `/docs/file-uploads.md` for deeper design notes.
