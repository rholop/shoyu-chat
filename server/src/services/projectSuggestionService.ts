import fs from 'fs/promises';
import path from 'path';
import * as ledgerService from './ledgerService';
import * as aiRouter from './aiRouter';
import { dataDir } from '../storage';
import { getISOWeekKey } from '../utils/dateHelpers';
import { LedgerEntry, ProjectSuggestion } from '../types';

function dismissedPath(): string {
  return path.join(dataDir(), 'insights', 'dismissed-suggestions.json');
}

async function getDismissed(): Promise<string[]> {
  try {
    const raw = await fs.readFile(dismissedPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function dismissSuggestion(topic: string): Promise<void> {
  const dismissed = await getDismissed();
  const normalized = topic.toLowerCase().trim();
  if (!dismissed.includes(normalized)) {
    dismissed.push(normalized);
    const p = dismissedPath();
    const dir = path.dirname(p);
    await fs.mkdir(dir, { recursive: true });
    const tmp = p + '.' + Math.random().toString(36).slice(2) + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(dismissed, null, 2), 'utf8');
    await fs.rename(tmp, p);
  }
}

export async function getProjectSuggestions(): Promise<ProjectSuggestion[]> {
  const entries = await ledgerService.readAll();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().slice(0, 10);

  // Collect all unique topics
  const topicMap = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    for (const topic of entry.topics) {
      const key = topic.toLowerCase().trim();
      if (!topicMap.has(key)) topicMap.set(key, []);
      topicMap.get(key)!.push(entry);
    }
  }

  const suggestions: ProjectSuggestion[] = [];

  for (const [topicKey, topicEntries] of topicMap) {
    // Skip if any entry has a projectId
    if (topicEntries.some((e) => e.projectId !== null)) continue;

    const distinctConvIds = new Set(topicEntries.map((e) => e.conversationId));
    if (distinctConvIds.size < 5) continue;

    const distinctWeeks = new Set(topicEntries.map((e) => getISOWeekKey(new Date(e.date))));
    if (distinctWeeks.size < 2) continue;

    const sortedByDate = [...topicEntries].sort((a, b) => b.date.localeCompare(a.date));
    const lastSeen = sortedByDate[0].date;
    if (lastSeen < cutoff) continue; // not recent enough

    const firstSeen = sortedByDate[sortedByDate.length - 1].date;
    const relatedGoals = Array.from(new Set(sortedByDate.map((e) => e.goal)))
      .filter(Boolean)
      .slice(0, 3);

    // Use original casing from first occurrence (chronologically)
    const chronological = [...topicEntries].sort((a, b) => a.date.localeCompare(b.date));
    const originalTopic =
      chronological[0].topics.find((t: string) => t.toLowerCase().trim() === topicKey) ?? topicKey;

    suggestions.push({
      topic: originalTopic,
      conversationCount: distinctConvIds.size,
      weekCount: distinctWeeks.size,
      firstSeen,
      lastSeen,
      relatedGoals,
      relatedConversationIds: [...distinctConvIds],
    });
  }

  const dismissed = await getDismissed();
  return suggestions
    .filter((s) => !dismissed.includes(s.topic.toLowerCase().trim()))
    .sort((a, b) => b.conversationCount - a.conversationCount)
    .slice(0, 3);
}

export async function generateProjectContext(suggestion: ProjectSuggestion): Promise<string> {
  const prompt = `You are generating a starter context document for a personal AI project.

The user has been repeatedly exploring the topic: "${suggestion.topic}"
It has come up in ${suggestion.conversationCount} conversations across ${suggestion.weekCount} weeks.

Recent goals from these conversations:
${suggestion.relatedGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Write a concise project context document in markdown (150-300 words) that:
1. Names the project based on the topic
2. Describes what the user seems to be trying to accomplish based on the goals
3. Lists 3-5 likely sub-goals or areas to explore
4. Notes any open questions suggested by the goals

This will be injected as a system prompt into future AI conversations about this project.
Write in second person ("You are working on..."). Be specific to the actual goals, not generic.
Output only the markdown content — no preamble, no explanation.`;

  return await aiRouter.summarize(prompt);
}
