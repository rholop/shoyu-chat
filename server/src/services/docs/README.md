# Services

Business logic and external integrations for the shoyu-chat backend.

| File | Purpose |
|---|---|
| `aiRouter.ts` | Intent classification and tiered fallback routing across providers. |
| `groqService.ts` | Integration with Groq (Llama 3.3). |
| `geminiService.ts` | Integration with Google Gemini (Flash/Pro) including vision and search. |
| `nvidiaService.ts` | Integration with NVIDIA NIM (Llama 3.3 70B). |
| `openrouterService.ts` | Integration with OpenRouter free-tier models. |
| `fileService.ts` | Logic for extracting text/images from uploads and handling AI-created downloads. |
| `projectService.ts` | Management of project context and cross-conversation summaries. |
| `summaryService.ts` | 4-hour inactivity debounce logic and summarization orchestration. |
| `markdownService.ts` | File-system operations for reading/writing structured markdown logs. |
| `emailService.ts` | Rendering and sending the weekly digest via Resend. |
| `memoryService.ts` | Managing the persistent `user-memory.md` profile. |

See `../../../../docs/ai-router.md` for routing details and `../../../../docs/write-file-tool.md` for download handling.
