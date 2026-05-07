# TodoPanel Component

The main interface for managing all to-dos. Accessible via `/chat/todos`.

## Features

- **Data Fetching**: Uses the `useTodos` hook for automatic data management.
- **Grouping**: Automatically groups open to-dos by priority (Now, Soon, Someday).
- **Filtering**: Client-side filtering by priority.
- **Completed Toggle**: Toggle to show/hide completed tasks in a separate section.
- **Empty State**: Friendly message when no open to-dos exist.
- **Loading State**: Skeleton placeholders during initial fetch.
- **Error Handling**: Error message with refresh option.
- **Sorting**:
  - Open: Grouped by priority, then `createdAt` desc.
  - Completed: `updatedAt` desc.
