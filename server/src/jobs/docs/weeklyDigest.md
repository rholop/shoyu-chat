# Weekly Digest Job

The weekly digest job runs every Sunday at 11:59 PM to generate a personal summary and insights email for the user.

## Job Steps

1.  **Flush Pending Summaries**: Calls `summaryService.flushAllPending()` to ensure all conversations from the past week are summarized.
2.  **Gather Context**:
    - Reads weekly and monthly markdown summaries.
    - Reads summaries for all active projects.
3.  **Gather Data (Concurrent)**:
    - `insightsService.buildPatternReport()`: Computes topic and intent patterns.
    - `insightsService.getUnresolvedThreads()`: Retrieves conversations marked as unresolved.
    - `insightsService.buildRollingHistory(8)`: Gets the last 8 weeks of activity.
    - `projectSuggestionService.getProjectSuggestions()`: Identifies recurring topics without a project.
    - `todoDigestService.buildTodoDigestReport()`: Assembles to-do activity and overdue items.
4.  **AI Analysis (Concurrent)**:
    - **Call 1 (Narrative)**: Generates the "This Week's Summary" section, now aware of to-do activity and commitments.
    - **Call 2 (Personal Insights)**: Generates the "About You" section, including observations on to-do patterns and follow-through.
5.  **Render & Send**:
    - Constructs the email HTML using `emailService.buildDigestEmailHtml()`.
    - Includes a "Your Commitments" section if any to-dos exist in the system history.
    - Sends the email via Resend.

## To-Do Awareness

The digest is aware of to-dos in several ways:
- **Narrative Section**: The AI is prompted with lists of created, completed, and overdue to-dos to help it contextualize the week's progress.
- **Insights Section**: The AI analyzes follow-through patterns (e.g., "accumulating to-do debt" or "focusing on X but neglecting Y").
- **Email UI**: A dedicated "Your Commitments" section displays to-do counts and lists of specific items.

### Overdue Criteria
- `dueDate` < today AND status is `open`.
- Priority is `now` AND created > 7 days ago AND status is `open`.
