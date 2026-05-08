# TodoItem Component

A single to-do row providing editing, priority management, and status toggling.

## Props

```typescript
interface TodoItemProps {
  todo: Todo;
  onUpdate: (updates: Partial<Pick<Todo, 'status' | 'priority' | 'dueDate' | 'snoozedUntil' | 'text'>>) => void;
  onDelete: () => void;
  onOpenEditor?: () => void;
}
```

## Features

- **Click to edit**: Clicking anywhere on the main content area (text, metadata row) calls `onOpenEditor` to open the `TodoDetailEditor`. Does not fire when clicking the checkbox, priority badge, or action buttons.
- **Status Toggle**: Checkbox toggles between `open` and `done`.
- **Priority Cycle**: Clicking the priority badge cycles: `now` -> `soon` -> `someday` -> `now`.
- **Snooze**: Quick action to snooze a to-do for 1 day.
- **Calendar Export**: Calendar icon button to export the single to-do as an `.ics` file.
- **Navigation**: Link icon to jump to the source conversation.
- **Delete**: Trash icon with a confirmation prompt.
- **Visual States**: Completed items show with a strikethrough and reduced opacity. Snoozed items show a clock icon and date.

## Pending Badge

When `todo.calendarStatus === 'pending'`, a small muted pill badge "Pending" is shown inline after the todo text, before the priority badge. Tooltip: "Not yet in calendar — set a date to publish".

When `calendarStatus === 'published'`, no badge is shown (the published state is the clean default).
