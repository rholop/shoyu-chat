import cron from 'node-cron';
import { flushAllPending } from '../services/summaryService';
import { readWeeklySummary, readMonthlySummary } from '../services/markdownService';
import { summarize } from '../services/aiRouter';
import { sendWeeklyDigestEmail } from '../services/emailService';
import { buildPatternReport } from '../services/insightsService';
import { listProjects, getProjectSummary } from '../storage';
import { getISOWeekKey, getMonthKey, getWeekRangeLabel } from '../utils/dateHelpers';
import { logger } from '../utils/logger';

export async function sendWeeklyDigest(date?: Date) {
  logger.info('Weekly digest job starting');

  // Flush any pending unsummarized conversations first
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

  const patternReport = await buildPatternReport();

  const insightsPrompt = `You are generating a personal weekly digest for a solo developer.

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

Based on all of the above, write a personal insights section that includes:
1. What you seem to be genuinely interested in right now (back it up with the data)
2. Any patterns worth naming — things you return to, avoid, or circle around
3. Orphan interests that might deserve a dedicated project
4. 3-5 specific, actionable project ideas grounded in your actual recent activity
Be direct and specific. Use the data. Do not be generic.`;

  let insights = '';
  try {
    insights = await summarize(insightsPrompt);
  } catch (err) {
    logger.warn('Could not generate AI insights for digest:', err);
    insights = 'AI insights unavailable this week (quota exceeded).';
  }

  await sendWeeklyDigestEmail({
    weekLabel,
    weekSummary,
    monthSummary,
    insights,
    patternReport,
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
