# WRITE_FILE Tool

The `write_file` tool allows the AI to create, modify, and version files directly within a conversation's persistent storage.

## Concept

Every AI intent (except those explicitly disabling tools) has access to the `write_file` function. This enables the AI to "output" code, reports, or documents into actual files that the user can download, rather than just displaying them as text in the chat.

## Tool Definition

```typescript
{
  name: 'write_file',
  description: 'Create or overwrite a file in the conversation downloads directory.',
  parameters: {
    filename: 'script.py',
    content: '...',
    description: 'A brief summary of the file',
    fileId: 'Optional UUID for overwriting'
  }
}
```

## Overwrite & Versioning

To prevent data loss and allow for iterative development:

1. **Context Injection:** The AI is provided with a list of existing downloads (filename, fileId, version) in the system prompt.
2. **Overwrite Detection:** If the user asks for an update and the AI provides an existing `fileId`, the server triggers an overwrite.
3. **Versioning:**
   - Before a file is overwritten, the current version is moved to a hidden `.versions/` directory.
   - Filename format: `{fileId}-v{n}-{filename}`.
   - Max Versions: The last 3 versions are retained; older versions are pruned.
   - Active Path: The latest version is always accessible at the base `downloads/` path.

## Sanitization

All filenames are sanitized to prevent path traversal and ensure compatibility across filesystems:
- Only alphanumeric, dots, underscores, and dashes allowed.
- Double dots and hidden file prefixes are replaced.
- Max length of 200 characters.

## UI Integration

- Assistant messages containing tool calls display download links.
- "Updated" badges indicate when a file is a revision of a previously created one.
- Project Detail views aggregate these downloads across all project conversations.
