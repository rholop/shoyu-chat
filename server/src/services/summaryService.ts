import {
  getConversationMeta,
  getMessages,
  getRecentlyActiveConversations,
} from '../storage';
import { summarize } from './aiRouter';
import { regenerateProjectSummary } from './projectService';
import {
  writeChatFile,
  upsertWeeklyEntry,
  writeMonthlyFile,
  readWeeklySummary,
} from './markdownService';
import { getISOWeekKey, getMonthKey } from '../utils/dateHelpers';
import { logger } from '../utils/logger';
import { updateMemoryFromConversation } from './memoryService';
import { append as appendLedgerEntry } from './ledgerService';

const INACTIVITY_MS = 4 * 60 * 60 * 1000; // 4 hours
const pendingTimers = new Map<string, NodeJS.Timeout>();

export function schedule(conversationId: string) {
  if (pendingTimers.has(conversationId)) {
    clearTimeout(pendingTimers.get(conversationId)!);
  }
  const timer = setTimeout(async () => {
    pendingTimers.delete(conversationId);
    try {
      await runSummary(conversationId);
    } catch (err) {
      logger.error(`Summary failed for conversation ${conversationId}:`, err);
    }
  }, INACTIVITY_MS);
  pendingTimers.set(conversationId, timer);
}

export function recoverSummaryTimers() {
  const recent = getRecentlyActiveConversations(INACTIVITY_MS);
  if (recent.length > 0) {
    logger.info(`Recovering summary timers for ${recent.length} conversation(s)`);
    for (const id of recent) {
      schedule(id);
    }
  }
}

export async function flushAllPending() {
  const ids = Array.from(pendingTimers.keys());
  for (const id of ids) {
    clearTimeout(pendingTimers.get(id)!);
    pendingTimers.delete(id);
    try {
      await runSummary(id);
    } catch (err) {
      logger.error(`Flush summary failed for conversation ${id}:`, err);
    }
  }
}

export async function runSummary(conversationId: string) {
  const meta = getConversationMeta(conversationId);
  if (!meta) throw new Error(`Conversation ${conversationId} not found`);

  const messages = getMessages(conversationId);
  if (messages.length === 0) return;

  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const models = [...new Set(messages.map((m) => m.model).filter(Boolean))] as string[];
  const dateStr = meta.created_at.slice(0, 10);

  // 1. Full summary
  const summaryPrompt = `Summarize this conversation in 2-4 sentences covering:
1. What the user was trying to accomplish (the goal)
2. The approach or direction taken
3. The outcome or resolution, if any
Be specific. Avoid vague language like "the user discussed X."

Conversation:
${transcript}`;

  const summary = await summarize(summaryPrompt);

  // 2. Topics
  const topicsPrompt = `List 3-6 specific topics or technologies from this conversation as short noun phrases. Focus on concrete subjects, not meta-descriptions. Return as a comma-separated list only, nothing else.

Conversation:
${transcript}`;

  const topics = await summarize(topicsPrompt);

  // 3. Write chat file
  writeChatFile({
    id: conversationId,
    title: meta.title,
    date: dateStr,
    models,
    summary,
    topics,
  });

  // 4. One-liner for weekly log
  const oneLinerPrompt = `Summarize this conversation in a single sentence focused on what the user was trying to accomplish or figure out. Start with a verb. Be specific.
Examples: "Debugged a CORS issue in an Express app."
          "Planned a React project structure for a PWA."
Do not describe the conversation itself. Describe the goal.

Conversation:
${transcript}`;

  const oneLiner = await summarize(oneLinerPrompt);

  upsertWeeklyEntry({ date: dateStr, title: meta.title, oneLiner });

  // 5. Regenerate monthly summary
  await regenerateMonthlySummary(dateStr.slice(0, 7));

  // 6. Update user memory with new facts from this conversation
  try {
    await updateMemoryFromConversation(transcript);
  } catch (err) {
    logger.error(`Memory update failed for conversation ${conversationId}:`, err);
  }

  // 7. If conversation belongs to a project, regenerate its summary
  if (meta.projectId) {
    try {
      await regenerateProjectSummary(meta.projectId);
    } catch (err) {
      logger.error(`Project summary failed for project ${meta.projectId}:`, err);
    }
  }

  // 8. Append to topic ledger (piggybacks on this run, no extra AI call)
  try {
    await appendLedgerEntry(conversationId);
  } catch (err) {
    logger.error(`Ledger append failed for conversation ${conversationId}:`, err);
  }

  logger.info(`Summary complete for conversation ${conversationId}`);
}

async function regenerateMonthlySummary(monthKey: string) {
  const weeklySummaries: string[] = [];
  for (let w = 1; w <= 53; w++) {
    const key = `${monthKey.slice(0, 4)}-W${String(w).padStart(2, '0')}`;
    const content = readWeeklySummary(key);
    if (content) weeklySummaries.push(content);
  }

  if (weeklySummaries.length === 0) return;

  const monthlyPrompt = `Given these weekly one-line conversation summaries, write a 3-4 sentence overview of this month's AI usage focused on:
- Recurring goals or problems
- What the user seems to be building or learning
- Any notable shifts in focus
Write in second person ("You spent..."). Do not list individual conversations.

Summaries:
${weeklySummaries.join('\n\n')}`;

  const overview = await summarize(monthlyPrompt);

  const conversations: Array<{ title: string; oneLiner: string }> = [];
  for (const weekly of weeklySummaries) {
    const rows = weekly.split('\n').filter((l) => l.startsWith('|') && !l.includes('---'));
    for (const row of rows.slice(1)) {
      const cols = row.split('|').map((s) => s.trim()).filter(Boolean);
      if (cols.length >= 3) {
        conversations.push({ title: cols[1], oneLiner: cols[2] });
      }
    }
  }

  writeMonthlyFile({ monthKey, overview, conversations });
}
