import {
  LedgerEntry,
  PatternReport,
  TopicFrequency,
  IntentFrequency,
  TopicSeries,
} from '../types';
import * as ledgerService from './ledgerService';
import { getISOWeekKey } from '../utils/dateHelpers';
import { listConversations, getProjectMeta } from '../storage';

export interface UnresolvedThread {
  conversationId: string;
  title: string;
  goal: string; // from topic-ledger.jsonl one-liner
  projectId: string | null;
  projectName: string | null;
  date: string;
  daysSinceCreated: number;
}

export async function getUnresolvedThreads(): Promise<UnresolvedThread[]> {
  const allConversations = listConversations();
  const unresolved = allConversations.filter((c) => c.resolved === false);

  const ledgerEntries = await ledgerService.readAll();
  const ledgerMap = new Map<string, LedgerEntry>();
  for (const entry of ledgerEntries) {
    ledgerMap.set(entry.conversationId, entry);
  }

  const now = new Date();

  const results: UnresolvedThread[] = unresolved
    .map((c) => {
      const entry = ledgerMap.get(`conversation-${c.id}`);
      const created = new Date(c.created_at);
      const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

      let projectName: string | null = null;
      if (c.projectId) {
        const projectMeta = getProjectMeta(c.projectId);
        if (projectMeta) {
          projectName = projectMeta.name;
        }
      }

      return {
        conversationId: c.id,
        title: c.title,
        goal: entry?.goal ?? '',
        projectId: c.projectId ? `project-${c.projectId}` : null,
        projectName,
        date: c.created_at.slice(0, 10),
        createdAt: c.created_at,
        daysSinceCreated,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  return results;
}

export async function buildPatternReport(): Promise<PatternReport> {
  const allEntries = await ledgerService.readAll();
  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const fourWeeksAgoDateStr = fourWeeksAgo.toISOString().slice(0, 10);

  const recentEntries = allEntries.filter(e => e.date >= fourWeeksAgoDateStr);
  const oldEntries = allEntries.filter(e => e.date < fourWeeksAgoDateStr);

  return {
    generatedAt: now.toISOString(),
    allTime: computeAllTime(allEntries),
    last4Weeks: computeLast4Weeks(recentEntries, oldEntries, now),
    recurring: computeRecurring(allEntries),
  };
}

function computeAllTime(entries: LedgerEntry[]) {
  const topTopics = getTopTopics(entries, 10);
  const topIntents = getTopIntents(entries);

  const projectCounts = new Map<string, number>();
  const topicsWithProject = new Set<string>();
  const topicsWithoutProjectMap = new Map<string, number>();

  for (const entry of entries) {
    if (entry.projectName) {
      projectCounts.set(entry.projectName, (projectCounts.get(entry.projectName) ?? 0) + 1);
    }
    for (const topic of entry.topics) {
      if (entry.projectId) {
        topicsWithProject.add(topic);
      } else {
        topicsWithoutProjectMap.set(topic, (topicsWithoutProjectMap.get(topic) ?? 0) + 1);
      }
    }
  }

  let mostActiveProject: string | null = null;
  let maxProjectCount = 0;
  for (const [name, count] of projectCounts.entries()) {
    if (count > maxProjectCount) {
      mostActiveProject = name;
      maxProjectCount = count;
    }
  }

  const topicsWithoutProject = Array.from(topicsWithoutProjectMap.entries())
    .filter(([topic]) => !topicsWithProject.has(topic))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  return {
    topTopics,
    topIntents,
    totalConversations: entries.length,
    totalMessages: entries.reduce((sum, e) => sum + e.messageCount, 0),
    mostActiveProject,
    topicsWithoutProject,
  };
}

function computeLast4Weeks(recent: LedgerEntry[], old: LedgerEntry[], now: Date) {
  const topTopics = getTopTopics(recent, 10);
  const topIntents = getTopIntents(recent);

  const recentTopics = new Set(recent.flatMap(e => e.topics));
  const oldTopics = new Set(old.flatMap(e => e.topics));

  const newTopics = Array.from(recentTopics).filter(t => !oldTopics.has(t));
  const returningTopics = Array.from(recentTopics).filter(t => oldTopics.has(t));

  // Weekly counts for the last 4 weeks (28 days)
  const weekCounts = new Map<string, number>();
  for (let i = 0; i < 28; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const weekKey = getISOWeekKey(d);
    if (!weekCounts.has(weekKey)) {
      weekCounts.set(weekKey, 0);
    }
  }

  for (const entry of recent) {
    const d = new Date(entry.date);
    const weekKey = getISOWeekKey(d);
    if (weekCounts.has(weekKey)) {
      weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + 1);
    }
  }

  const weeklyConversationCounts = Array.from(weekCounts.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));

  return {
    topTopics,
    topIntents,
    newTopics,
    returningTopics,
    weeklyConversationCounts,
  };
}

function computeRecurring(entries: LedgerEntry[]) {
  const weekToTopics = new Map<string, Set<string>>();
  const topicToWeeks = new Map<string, Set<string>>();
  const topicFirstLast = new Map<string, { first: string; last: string }>();

  for (const entry of entries) {
    const weekKey = getISOWeekKey(new Date(entry.date));
    if (!weekToTopics.has(weekKey)) weekToTopics.set(weekKey, new Set());

    for (const topic of entry.topics) {
      weekToTopics.get(weekKey)!.add(topic);

      if (!topicToWeeks.has(topic)) topicToWeeks.set(topic, new Set());
      topicToWeeks.get(topic)!.add(weekKey);

      const range = topicFirstLast.get(topic) || { first: entry.date, last: entry.date };
      if (entry.date < range.first) range.first = entry.date;
      if (entry.date > range.last) range.last = entry.date;
      topicFirstLast.set(topic, range);
    }
  }

  const topicsSeenMultipleWeeks: TopicSeries[] = [];
  let longestRunningTopic: string | null = null;
  let maxWeeks = 0;

  for (const [topic, weeks] of topicToWeeks.entries()) {
    if (weeks.size >= 3) {
      const range = topicFirstLast.get(topic)!;
      topicsSeenMultipleWeeks.push({
        topic,
        weekCount: weeks.size,
        firstSeen: range.first,
        lastSeen: range.last,
      });
    }
    if (weeks.size > maxWeeks) {
      maxWeeks = weeks.size;
      longestRunningTopic = topic;
    }
  }

  topicsSeenMultipleWeeks.sort((a, b) => b.weekCount - a.weekCount);

  return {
    topicsSeenMultipleWeeks,
    longestRunningTopic,
  };
}

function getTopTopics(entries: LedgerEntry[], limit: number): TopicFrequency[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const topic of entry.topics) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function getTopIntents(entries: LedgerEntry[]): IntentFrequency[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.intent) {
      counts.set(entry.intent, (counts.get(entry.intent) ?? 0) + 1);
    }
  }
  const total = entries.length;
  return Array.from(counts.entries())
    .map(([intent, count]) => ({
      intent,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
