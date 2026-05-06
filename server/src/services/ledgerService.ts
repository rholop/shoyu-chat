import fs from 'fs';
import path from 'path';
import { dataDir, getConversationMeta, getMessages, getProjectMeta } from '../storage';
import { LedgerEntry } from '../types';
import { logger } from '../utils/logger';

const LEDGER_FILE = path.join('insights', 'topic-ledger.jsonl');

function ledgerPath() {
  return path.join(dataDir(), LEDGER_FILE);
}

function insightsDir() {
  return path.join(dataDir(), 'insights');
}

function parseTopicsFromMarkdown(content: string): string[] {
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.trim() === '## Topics');
  if (idx === -1 || idx + 1 >= lines.length) return [];
  const topicLine = lines[idx + 1].trim();
  if (!topicLine) return [];
  return topicLine
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseGoalFromMarkdown(content: string): string {
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => l.trim() === '## Summary');
  if (idx === -1) return '';
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Take first sentence
    const sentenceEnd = line.search(/[.!?]/);
    return sentenceEnd !== -1 ? line.slice(0, sentenceEnd + 1) : line;
  }
  return '';
}

function mostCommon(values: string[]): string {
  if (values.length === 0) return '';
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [v, count] of counts) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
  }
  return best;
}

export async function append(conversationId: string): Promise<void> {
  try {
    const meta = getConversationMeta(conversationId);
    if (!meta) {
      logger.warn(`ledgerService.append: conversation ${conversationId} not found`);
      return;
    }

    const messages = getMessages(conversationId);
    const nonInternal = messages.filter((m) => m.role !== 'internal');
    const messageCount = nonInternal.length;

    const modelValues = nonInternal
      .map((m) => m.model)
      .filter((m): m is string => Boolean(m));
    const model = mostCommon(modelValues) || '';

    // intent is stored in internal messages as JSON with an `intent` field
    const intentValues = messages
      .filter((m) => m.role === 'internal')
      .flatMap((m) => {
        try {
          const parsed = JSON.parse(m.content) as { intent?: string };
          return parsed.intent ? [parsed.intent] : [];
        } catch {
          return [];
        }
      });
    const intent = mostCommon(intentValues) || '';

    const date = meta.created_at.slice(0, 10);
    const mdFilename = `${date}-${conversationId}.md`;
    const mdPath = path.join(dataDir(), 'chats', mdFilename);

    let topics: string[] = [];
    let goal = '';

    if (fs.existsSync(mdPath)) {
      const mdContent = fs.readFileSync(mdPath, 'utf8');
      topics = parseTopicsFromMarkdown(mdContent);
      goal = parseGoalFromMarkdown(mdContent);
    } else {
      logger.warn(`ledgerService.append: markdown file not found at ${mdPath}`);
    }

    let projectId: string | null = meta.projectId ?? null;
    let projectName: string | null = null;

    if (projectId) {
      const projectMeta = getProjectMeta(projectId);
      if (projectMeta) {
        projectName = projectMeta.name;
      }
    }

    const entry: LedgerEntry = {
      date,
      conversationId: `conversation-${conversationId}`,
      topics,
      goal,
      intent,
      projectId: projectId ? `project-${projectId}` : null,
      projectName,
      model,
      messageCount,
      resolved: meta.resolved ?? null,
    };

    fs.mkdirSync(insightsDir(), { recursive: true });
    await fs.promises.appendFile(ledgerPath(), JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    logger.error(`ledgerService.append failed for conversation ${conversationId}:`, err);
  }
}

export async function readAll(): Promise<LedgerEntry[]> {
  const p = ledgerPath();
  if (!fs.existsSync(p)) return [];
  const content = await fs.promises.readFile(p, 'utf8');
  return content
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LedgerEntry];
      } catch {
        logger.warn(`ledgerService.readAll: skipping malformed line: ${line.slice(0, 80)}`);
        return [];
      }
    });
}

export async function readSince(date: string): Promise<LedgerEntry[]> {
  const all = await readAll();
  return all.filter((e) => e.date >= date);
}

export function getTopicFrequency(entries: LedgerEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const topic of entry.topics) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

export function getByProject(entries: LedgerEntry[], projectId: string): LedgerEntry[] {
  return entries.filter((e) => e.projectId === projectId);
}
