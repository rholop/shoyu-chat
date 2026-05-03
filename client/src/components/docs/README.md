# Components

React UI components for the shoyu-chat PWA.

## Subdirectories

- **layout/**: `AppShell`, `Sidebar`, and `TopBar` — the framing of the application.
- **chat/**: `ChatView`, `MessageBubble`, `MessageInput` — the core conversation interface.
- **projects/**: `ProjectList`, `ProjectDetail`, `ContextEditor` — project-specific management.
- **auth/**: `LoginScreen` — authentication interface.

## Design Principles

- **Mobile-First:** All components are designed to be fully functional on small screens.
- **High Contrast:** UI elements follow the strict accessibility guidelines for dark/light modes.
- **Streaming UI:** `ChatView` and `MessageBubble` handle incremental text updates from SSE.
