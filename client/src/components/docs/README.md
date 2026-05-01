# Components

React UI components organized by feature area.

## auth/

| File | Purpose |
|---|---|
| `LoginScreen.tsx` | Username/password form; delegates to `useAuth` |

## chat/

| File | Purpose |
|---|---|
| `AttachmentChip.tsx` | Pill showing filename + icon (or image thumbnail); optional remove button; wraps in `<a>` when `conversationId` is provided |
| `ChatView.tsx` | Main chat pane; renders message list, streaming bubble, and `MessageInput` |
| `MessageBubble.tsx` | Single message; renders markdown; shows `AttachmentChip`s for messages with files |
| `MessageInput.tsx` | Textarea + send + paperclip buttons; drag-and-drop target; shows pending `AttachmentChip`s above textarea |
| `ModelBadge.tsx` | Tiny colored badge showing the AI provider used |

## layout/

| File | Purpose |
|---|---|
| `AppShell.tsx` | Root layout — sidebar + topbar + chat pane; owns mobile/desktop sidebar open state; auto-selects first conversation |
| `Sidebar.tsx` | Conversation list with new-chat button; each row shows title, date, `ModelBadge`, delete button |
| `TopBar.tsx` | Header with hamburger (mobile), title, new-chat, sign-out buttons |
