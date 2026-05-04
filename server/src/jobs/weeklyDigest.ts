import cron from 'node-cron';
import { flushAllPending } from '../services/summaryService';
import { readWeeklySummary, readMonthlySummary } from '../services/markdownService';
import { summarize } from '../services/aiRouter';
import { sendWeeklyDigestEmail } from '../services/emailService';
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

  const insightsPrompt = `Given these AI conversation summaries for the week and month, provide:
1. Recurring themes or questions this week
2. Patterns in how I use AI
3. Topics I seem to be exploring or learning
4. 3-5 concrete project ideas inspired by this week's conversations
Be specific. Reference actual topics from the summaries.

Weekly summary:
${weekSummary || 'No conversations this week.'}

Monthly summary:
${monthSummary || 'No monthly summary yet.'}`;

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
