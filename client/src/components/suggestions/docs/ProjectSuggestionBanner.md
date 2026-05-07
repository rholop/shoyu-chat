# Project Suggestion Banner

The `ProjectSuggestionBanner` is an ambient UI component that surfaces project creation suggestions based on recurring orphan topics.

## Placement
It is rendered in the `Sidebar`, above the "Projects" section.

## Behavior
- **Visibility**: Only visible when there is at least one active suggestion from the backend.
- **Selection**: Displays only the highest-ranked suggestion (based on conversation count).
- **Dismissal**: If a user clicks "Not now", the suggestion is dismissed permanently (via `dismissSuggestion` API). The banner then immediately hides or shows the next suggestion if one exists.
- **Conversion**: Clicking "Create Project" triggers:
  1. AI-powered context generation for the topic.
  2. Creation of a new project.
  3. Automatic navigation to the new project view.

## States
- **Loading**: Renders nothing while fetching suggestions.
- **Empty**: Renders nothing if no suggestions meet the detection thresholds.
- **Success**: Displays the topic, conversation/week counts, and recent goals.
- **Error**: Shows an inline error message if project creation fails.
