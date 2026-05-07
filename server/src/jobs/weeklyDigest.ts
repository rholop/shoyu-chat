import cron from 'node-cron';
import { flushAllPending } from '../services/summaryService';
import { readWeeklySummary, readMonthlySummary } from '../services/markdownService';
import { summarize } from '../services/aiRouter';
import { sendWeeklyDigestEmail } from '../services/emailService';
import {
  buildPatternReport,
  getUnresolvedThreads,
  buildRollingHistory,
} from '../services/insightsService';
import * as todoDigestService from '../services/todoDigestService';
import { TodoDigestReport } from '../services/todoDigestService';
import { PatternReport, RollingWeek, ProjectSuggestion, OpenLoop } from '../types';
import { listProjects, getProjectSummary } from '../storage';
import * as projectSuggestionService from '../services/projectSuggestionService';
import { getISOWeekKey, getMonthKey, getWeekRangeLabel } from '../utils/dateHelpers';
import { logger } from '../utils/logger';

function buildDigestPrompt(
  weekSummary: string,
  monthSummary: string,
  projectSummaries: string,
  patternReport: PatternReport,
  unresolvedThreads: OpenLoop[],
  projectSuggestions: ProjectSuggestion[],
  todoDigest: TodoDigestReport,
): string {
  const suggestionSection =
    projectSuggestions.length > 0
      ? `## Recurring Topics Without a Project
${projectSuggestions
  .map(
    (s) =>
      `- "${s.topic}": ${s.conversationCount} conversations across ${s.weekCount} weeks. Recent goals: ${s.relatedGoals.join('; ')}`,
  )
  .join('\n')}

When writing project ideas, consider whether any of these recurring interests deserve to become a formal project.`
      : '(No recurring orphan topics this week)';

  const unresolvedSection =
    unresolvedThreads.length > 0
      ? `## Loose Threads (unresolved conversations)
${unresolvedThreads
  .map(
    (t) =>
      `- "${t.title}" — ${t.goal} (${t.daysSinceCreated} days ago)${
        t.projectName ? `, in project: ${t.projectName}` : ''
      }`,
  )
  .join('\n')}

When writing insights, acknowledge these loose threads. If any connect to
recurring topics or current projects, call that out specifically.`
      : '';

  const todoSection = `## Your To-Do Activity This Week

Created this week (${todoDigest.createdThisWeek.length}):
${todoDigest.createdThisWeek.map(t => `- [${t.priority.toUpperCase()}] ${t.text}${t.projectName ? ` (${t.projectName})` : ''}`).join('\n') || '(none)'}

Completed this week (${todoDigest.completedThisWeek.length}):
${todoDigest.completedThisWeek.map(t => `- ${t.text}`).join('\n') || '(none)'}

Overdue (${todoDigest.overdue.length}):
${todoDigest.overdue.map(t => `- [${t.priority.toUpperCase()}] ${t.text} — created ${t.createdAt.slice(0, 10)}`).join('\n') || '(none)'}

Total open: ${todoDigest.totalOpen}
Total completed all time: ${todoDigest.totalDone}

When writing insights, note:
- Whether the user is creating more todos than completing (accumulating debt)
- Whether overdue todos have a pattern (same project, same intent)
- Whether any completed todos represent meaningful progress`;

  return `You are generating a personal weekly digest for a solo developer.

${todoSection}

## This Week's Conversations
${weekSummary || 'No conversations this week.'}

## This Month's Themes
${monthSummary || 'No monthly summary yet.'}

## Active Projects
${projectSummaries || 'No project summaries available.'}

## Pattern Report (computed, not AI-generated)
Total conversations all time: ${patternReport.allTime.totalConversations}
Most active project: ${patternReport.allTime.mostActiveProject || 'None'}

Top topics this week:
${patternReport.last4Weeks.topTopics.map((t) => `- ${t.topic} (${t.count} times)`).join('\n') || 'None'}

Returning topics (seen before, resurfaced this week):
${patternReport.last4Weeks.returningTopics.join(', ') || 'None'}

Topics you keep exploring without a project:
${patternReport.allTime.topicsWithoutProject.join(', ') || 'None'}

Topics seen across multiple weeks (persistent interests):
${
  patternReport.recurring.topicsSeenMultipleWeeks
    .map((s) => `- ${s.topic}: seen in ${s.weekCount} weeks, first: ${s.firstSeen}, last: ${s.lastSeen}`)
    .join('\n') || 'None'
}

Intent breakdown this month:
${patternReport.last4Weeks.topIntents.map((i) => `- ${i.intent}: ${i.percentage}% of conversations`).join('\n') || 'None'}

${suggestionSection}

${unresolvedSection}

Based on all of the above, write a personal insights section that includes:
1. What you seem to be genuinely interested in right now (back it up with the data)
2. Any patterns worth naming — things you return to, avoid, or circle around
3. Orphan interests that might deserve a dedicated project
4. 3-5 specific, actionable project ideas grounded in your actual recent activity
Be direct and specific. Use the data. Do not be generic.`;
}

function buildInsightPrompt(
  patternReport: PatternReport,
  unresolvedThreads: OpenLoop[],
  rollingHistory: RollingWeek[],
  todoDigest: TodoDigestReport,
): string {
  const totalConversations = patternReport.allTime.totalConversations;

  const allTimeTopTopics =
    patternReport.allTime.topTopics.map((t) => `${t.topic} (${t.count} times)`).join(', ') || 'None';

  const topicsWithoutProject = patternReport.allTime.topicsWithoutProject.join(', ') || 'None';
  const mostActiveProject = patternReport.allTime.mostActiveProject || 'None';

  const last4WeeksTopTopics =
    patternReport.last4Weeks.topTopics.map((t) => `${t.topic} (${t.count} times)`).join(', ') || 'None';

  const newTopics = patternReport.last4Weeks.newTopics.join(', ') || 'None';
  const returningTopics = patternReport.last4Weeks.returningTopics.join(', ') || 'None';

  const topIntents =
    patternReport.last4Weeks.topIntents.map((i) => `${i.intent}: ${i.percentage}%`).join(', ') || 'None';

  const persistentInterests =
    patternReport.recurring.topicsSeenMultipleWeeks
      .map((s) => `${s.topic}: ${s.weekCount} weeks, first seen ${s.firstSeen}`)
      .join('\n') || 'None';

  const unresolvedList =
    unresolvedThreads.length > 0
      ? unresolvedThreads
          .map((t) => `- ${t.title} — ${t.goal} (${t.daysSinceCreated} days ago)`)
          .join('\n')
      : 'None';

  const rollingHistoryText =
    rollingHistory.length > 0
      ? rollingHistory
          .map(
            (w) =>
              `${w.week}: ${w.conversationCount} conversations, top topics: ${w.topTopics.join(', ') || 'none'}`,
          )
          .join('\n')
      : 'No history available.';

  const todoPatterns = `## To-Do Patterns
Created this week: ${todoDigest.createdThisWeek.length}
Completed this week: ${todoDigest.completedThisWeek.length}
Currently overdue: ${todoDigest.overdue.length}
Total open: ${todoDigest.totalOpen}

${todoDigest.overdue.length > 0 ? `Overdue items: ${todoDigest.overdue.map(t => t.text).join('; ')}` : ''}

In the "Patterns Worth Naming" section, include one observation about the user's follow-through
on action items if the data is meaningful. For example: if many todos are created but few completed,
name that pattern. If overdue items cluster around one topic, note it.`;

  return `You are analyzing a solo developer's AI usage patterns to give them honest, specific personal insights. This is private data about their own behavior — be direct, not generic.

Note: This user has ${totalConversations} conversations in the ledger. If there is insufficient data to identify meaningful patterns, say so briefly and focus on what you can observe from what exists. Do not fabricate patterns.

## Pattern Data (computed, not AI-generated)

All-time top topics: ${allTimeTopTopics}
Topics never tied to a project: ${topicsWithoutProject}
Most active project: ${mostActiveProject}

Last 4 weeks top topics: ${last4WeeksTopTopics}
New topics this week: ${newTopics}
Returning topics this week: ${returningTopics}
Intent breakdown: ${topIntents}

Persistent interests (seen across 3+ weeks):
${persistentInterests}

## Unresolved Threads (${unresolvedThreads.length} open)
${unresolvedList}

## Rolling 8-Week Conversation History
${rollingHistoryText}

${todoPatterns}

---

Write a personal insights section with these exact four parts. Be specific. Use the data. Do not be generic or encouraging for its own sake.

### What You're Actually Focused On
2-3 sentences on what the data shows you genuinely care about right now, backed by specific topic counts or patterns.

### Patterns Worth Naming
1-3 bullets naming honest behavioral patterns — things you return to, things you avoid, things you keep starting but not finishing. If there are no strong patterns yet, say so briefly.

### Orphan Interests
Topics you've returned to multiple times without ever committing to a project. For each, note how many times and when you last visited it. If none exist, omit this section.

### Suggested Projects
3-5 concrete, specific project ideas grounded directly in your recent activity. Each should reference the actual topics and goals from your conversations. Not generic. Not "build an app for X." Specific enough to start tomorrow.`;
}

export async function sendWeeklyDigest(date?: Date) {
  logger.info('Weekly digest job starting');

  // Step 1: Flush any pending unsummarized conversations
  await flushAllPending();

  const weekKey = getISOWeekKey(date);
  const monthKey = getMonthKey(date);
  const weekLabel = getWeekRangeLabel(date);

  const weekSummary = readWeeklySummary(weekKey);
  const monthSummary = readMonthlySummary(monthKey);

  const projects = listProjects();
  const projectSummaries = projects
    .map((p) => {
      const summary = getProjectSummary(p.id);
      return summary ? `### ${p.name}\n${summary}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  // Step 2: Read all source data concurrently
  const [patternReport, unresolvedThreads, rollingHistory, projectSuggestions, todoDigest] = await Promise.all([
    buildPatternReport(),
    getUnresolvedThreads(),
    buildRollingHistory(8),
    projectSuggestionService.getProjectSuggestions(),
    todoDigestService.buildTodoDigestReport(),
  ]);

  const digestPrompt = buildDigestPrompt(
    weekSummary,
    monthSummary,
    projectSummaries,
    patternReport,
    unresolvedThreads,
    projectSuggestions,
    todoDigest,
  );
  const insightPrompt = buildInsightPrompt(patternReport, unresolvedThreads, rollingHistory, todoDigest);

  // Step 3: Run both AI calls concurrently
  const [digestResult, insightResult] = await Promise.allSettled([
    summarize(digestPrompt),
    summarize(insightPrompt),
  ]);

  if (digestResult.status === 'rejected') {
    logger.warn('Could not generate digest narrative:', digestResult.reason);
  }
  if (insightResult.status === 'rejected') {
    logger.warn('Could not generate personal insights:', insightResult.reason);
  }

  const digestNarrative =
    digestResult.status === 'fulfilled'
      ? digestResult.value
      : 'AI insights unavailable this week (quota exceeded).';
  const personalInsights =
    insightResult.status === 'fulfilled'
      ? insightResult.value
      : 'Personal insights unavailable this week (quota exceeded).';

  // Step 4: Render and send
  await sendWeeklyDigestEmail({
    weekLabel,
    weekSummary,
    monthSummary,
    projectSummaries,
    digestNarrative,
    personalInsights,
    patternReport,
    unresolvedThreads,
    projectSuggestions,
    todoDigest,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  });

  logger.info('Weekly digest job complete');
}

export function scheduleWeeklyDigest() {
  // Sunday at 11:59 PM
  cron.schedule(
    '59 23 * * 0',
    () => {
      sendWeeklyDigest().catch((err) => logger.error('Weekly digest failed:', err));
    },
    { timezone: process.env.TZ ?? 'America/New_York' }
  );
  logger.info('Weekly digest cron scheduled');
}
