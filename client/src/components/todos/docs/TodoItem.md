# TodoItem Component

A single to-do row providing editing, priority management, and status toggling.

## Props

```typescript
interface TodoItemProps {
  todo: Todo;
  onUpdate: (updates: Partial<Pick<Todo, 'status' | 'priority' | 'dueDate' | 'snoozedUntil' | 'text'>>) => void;
  onDelete: () => void;
}
```

## Features

- **Inline Editing**: Click the text to edit. Saves on Enter or Blur. Cancels on Escape.
- **Status Toggle**: Checkbox toggles between `open` and `done`.
- **Priority Cycle**: Clicking the priority badge cycles: `now` -> `soon` -> `someday` -> `now`.
- **Snooze**: Quick action to snooze a to-do for 1 day.
- **Navigation**: Link icon to jump to the source conversation.
- **Delete**: Trash icon with a confirmation prompt.
- **Visual States**: Completed items show with a strikethrough and reduced opacity. Snoozed items show a clock icon and date.
