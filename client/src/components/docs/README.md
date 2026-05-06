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
| `MessageBubble.tsx` | Single message; renders markdown; shows `AttachmentChip`s for uploads and download chips for AI-written files |
| `MessageInput.tsx` | Textarea + send + paperclip buttons; drag-and-drop target; shows pending `AttachmentChip`s above textarea |
| `ModelBadge.tsx` | Tiny colored badge showing the AI provider used |

## layout/

| File | Purpose |
|---|---|
| `AppShell.tsx` | Root layout — sidebar + topbar + chat pane; owns mobile/desktop sidebar open state; auto-selects first conversation |
| `Sidebar.tsx` | Conversation list with new-chat button; renders `ProjectList` above unassigned conversations; each row shows title, date, `ModelBadge`, delete button |
| `TopBar.tsx` | Header with hamburger (mobile), title, search trigger, new-chat, sign-out buttons |

## projects/

| File | Purpose |
|---|---|
| `ProjectList.tsx` | Collapsible tree of projects in the sidebar; each project row has an inline "new chat" button; conversations listed as children |
| `ProjectDetail.tsx` | Full project view shown when a project is selected; displays name, description, context editor, AI-generated summary, conversation list, and project-wide downloads |
| `ContextEditor.tsx` | Textarea for editing a project's context document with save/cancel controls |

## search/

| File | Purpose |
|---|---|
| `SearchPalette.tsx` | Modal command-palette; opens on search trigger; debounced query input, filterable by type |
| `SearchResultItem.tsx` | Renders a single search result with type icon, title, snippet, and navigation target |
