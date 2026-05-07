# Todo Service

The `todoService` is responsible for extracting actionable to-do items from conversations after they are summarized.

## Purpose
It automatically identifies concrete tasks, follow-ups, or unresolved items discussed in a conversation and stores them as a durable data artifact.

## When It Runs
The service is called at the end of `summaryService.runSummary()`, typically after a 4-hour inactivity debounce.

## Storage
To-dos are stored in each conversation's directory:
`data/conversation-{id}/todos.json`

This file is created or overwritten each time a conversation is summarized. If no actionable items are found, an empty array `[]` is written.

## Key Functions

### `extractAndSave(conversationId: string): Promise<Todo[]>`
- Reads the conversation history (filtering out internal messages).
- Fetches project metadata if the conversation is linked to a project.
- Uses AI to extract up to 3 concrete to-do items.
- Assigns priority (`now`, `soon`, `someday`) and provides a `sourceMessageHint`.
- Performs an atomic write to `todos.json`.

### `getTodos(conversationId: string): Promise<Todo[]>`
- Reads and parses the `todos.json` for a specific conversation.
- Returns `[]` if the file doesn't exist or is invalid.

### `getAllTodos(): Promise<Todo[]>`
- Aggregates all to-dos across all conversations.
- Filters out items with `status: "done"`.
- Sorts by `createdAt` descending.
- Uses `getAllTodosWithStatus()` internally.

### `getAllTodosWithStatus(): Promise<Todo[]>`
- Aggregates all to-dos across all conversations regardless of their status (`open`, `done`, `snoozed`).
- Sorts by `createdAt` descending.

### `updateTodo(conversationId, todoId, updates): Promise<Todo>`
- Updates fields like `status`, `priority`, `text`, `dueDate`, or `snoozedUntil`.
- Sets `updatedAt` to the current time.
- Performs an atomic write back to the file.

## AI Prompt Behavior
- Routes through the `SUMMARIZING` intent path in `aiRouter`.
- Instructed to return strictly JSON.
- Safety checks ensure only valid, actionable items are stored.

## Error Handling
- All errors are caught and logged.
- Failures in todo extraction do not interrupt the main summary process.
- If extraction fails, it attempts to write an empty array to ensure the file exists.
