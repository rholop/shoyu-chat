# LoopItem Component

Renders a single row representing an open loop in the `LoopsPanel`.

## Props
- `loop: OpenLoop`: The loop data to display.
- `onSnooze: (date: string) => void`: Callback when a snooze option is selected.
- `onResolve: () => void`: Callback to mark the loop as resolved.
- `onCreateTodo: () => void`: Callback to convert the loop into a to-do.

## UI Elements
- **Title**: Clickable, navigates to the conversation.
- **Goal**: Displays the one-line goal from the topic ledger.
- **Badges**: Shows Project Name and Intent.
- **Age**: Shows "N days open" with color-coded alerts:
  - 4-13 days: Amber
  - 14+ days: Red
- **Snooze**: Dropdown with quick options (1 week, 2 weeks, 1 month).
- **Resolve**: Requires window confirmation.
- **To-Do**: Provides immediate visual feedback ("Added ✓") for 2 seconds.
