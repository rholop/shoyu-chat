import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  dataDir,
  getConversationMeta,
  getMessages,
  getProjectMeta,
  atomicWrite,
  StoredMessage,
} from '../storage';
import { Todo, TodoPriority, TodoUpdateFields, Intent, OpenLoop } from '../types';
import { summarize } from './aiRouter';
import { logger } from '../utils/logger';

function todoPath(conversationId: string) {
  return path.join(dataDir(), `conversation-${conversationId}`, 'todos.json');
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function isDuplicateTodoText(candidate: string, existing: string): boolean {
  const normCandidate = normalizeText(candidate);
  const normExisting = normalizeText(existing);
  if (!normCandidate || !normExisting) return false;
  if (normCandidate === normExisting) return true;
  if (normCandidate.includes(normExisting) || normExisting.includes(normCandidate)) return true;
  return jaccardSimilarity(normCandidate, normExisting) >= 0.7;
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

export function buildTodoPrompt(
  messages: { role: string; content: string }[],
  conversationTitle: string,
  projectName: string | null,
  anchorDate: string,
  existingTodos: string[] = []
): string {
  const context = projectName ? `This conversation is part of the project: "${projectName}".` : '';
  const history = messages
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n\n');
  const existingSection = existingTodos.length > 0
    ? `\nThese to-dos are already tracked for this conversation/project. Do not extract anything that restates, rephrases, or makes incremental progress on one of these:\n${existingTodos.map(t => `- ${t}`).join('\n')}\n`
    : '';

  return `You are extracting actionable to-do items from an AI conversation.

Conversation title: "${conversationTitle}"
Conversation date: ${anchorDate}
${context}
${existingSection}
Conversation:
${history}

---

Extract at most 3 concrete, specific to-do items from this conversation. Most conversations are purely informational and contain zero real to-dos — returning an empty array is the expected, common outcome. Only extract an item if you are confident the user would genuinely want to be reminded of it.

Rules:
- Only extract items the user explicitly committed to or unambiguously asked for (e.g. "remind me to...", "I need to...", "I'll do..."). Do not extract something only the assistant proposed or suggested unless the user clearly agreed to act on it.
- Do not extract vague intentions like "think about X" or "explore Y someday."
- Do not extract things the user already completed during the conversation.
- Do not extract hypothetical examples, sample code/config shown for illustration, or anything not tied to a real action the user intends to take.
- Do not extract anything already covered by the existing to-dos listed above.
- Write each to-do as a short imperative sentence starting with a verb. Max 120 characters.
- For each to-do, assign a priority:
  - "now" = urgent or explicitly time-sensitive
  - "soon" = clearly intended for the near future
  - "someday" = interesting but not urgent
- For each to-do, write one sentence explaining why you suggested it (sourceMessageHint).
- If there are no actionable to-dos, return an empty array.

Date extraction rules:
- If the conversation mentions a specific date or deadline for a to-do item, extract it as "dueDate" in YYYY-MM-DD format.
- Use "${anchorDate}" as today's date when resolving relative references.
- Relative date examples and how to resolve them (assuming anchorDate is 2026-05-08):
  - "by Friday" → find the next Friday on or after ${anchorDate} → "2026-05-08" if today is Friday, else the coming Friday
  - "next week" → the Monday of next week → "2026-05-11"
  - "by end of month" → the last day of the current month → "2026-05-31"
  - "May 15th" or "the 15th" → "2026-05-15"
  - "tomorrow" → "2026-05-09"
  - "in two weeks" → "2026-05-22"
- If no specific date or deadline is mentioned for a to-do, set "dueDate" to null.
- Do not invent a date. If unsure, set "dueDate" to null.
- Do not set a date that has already passed relative to ${anchorDate}.
- If a date would be in the past relative to ${anchorDate}, set "dueDate" to null instead.

Respond ONLY with a JSON array. No explanation, no markdown fences, no preamble.

Example output:
[
  {
    "text": "Deploy the updated Nginx config to production",
    "priority": "now",
    "dueDate": "2026-05-10",
    "sourceMessageHint": "You said you needed to deploy before the client demo on Sunday"
  },
  {
    "text": "Set up rclone R2 sync script on the VPS",
    "priority": "soon",
    "dueDate": null,
    "sourceMessageHint": "You discussed the R2 backup approach but did not complete the setup steps"
  }
]`;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseTodoResponse(
  raw: string,
  anchorDate: string
): Pick<Todo, 'text' | 'priority' | 'sourceMessageHint' | 'dueDate'>[] {
  try {
    // Strip markdown fences if the AI added them despite instructions
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item =>
        item &&
        typeof item.text === 'string' &&
        typeof item.priority === 'string' &&
        ['now', 'soon', 'someday'].includes(item.priority) &&
        typeof item.sourceMessageHint === 'string'
      )
      .slice(0, 3) // enforce max 3
      .map(item => {
        let dueDate: string | null = null;
        if (
          typeof item.dueDate === 'string' &&
          DATE_REGEX.test(item.dueDate) &&
          item.dueDate >= anchorDate
        ) {
          dueDate = item.dueDate;
        }
        return {
          text: item.text.slice(0, 120), // enforce max length
          priority: item.priority as TodoPriority,
          sourceMessageHint: item.sourceMessageHint,
          dueDate
        };
      });
  } catch {
    logger.warn('todoService: failed to parse AI todo response');
    return [];
  }
}

export async function extractAndSave(conversationId: string): Promise<Todo[]> {
  const existingOwn = await getTodos(conversationId);

  try {
    const meta = getConversationMeta(conversationId);
    if (!meta) {
      logger.warn(`todoService.extractAndSave: conversation ${conversationId} not found`);
      return existingOwn;
    }

    const messages = getMessages(conversationId);
    const nonInternalMessages = messages.filter(m => m.role !== 'internal');

    if (nonInternalMessages.length === 0) {
      // Nothing to extract from; leave any existing todos for this conversation untouched.
      return existingOwn;
    }

    const lastMessage = nonInternalMessages[nonInternalMessages.length - 1];
    const anchorDate: string = (lastMessage as any)?.created_at
      ? (lastMessage as any).created_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    let projectId = meta.projectId ?? null;
    let projectName: string | null = null;
    if (projectId) {
      const projectMeta = getProjectMeta(projectId);
      if (projectMeta) {
        projectName = projectMeta.name;
      }
    }

    // Gather existing to-dos for dedup/context: same conversation, plus same project (any status,
    // so a completed/deleted item isn't silently regenerated under different wording).
    let existingForDedup: Todo[] = existingOwn;
    if (projectId) {
      const allWithStatus = await getAllTodosWithStatus();
      const projectKey = `project-${projectId}`;
      const fromProject = allWithStatus.filter(t => t.projectId === projectKey);
      existingForDedup = fromProject.length > 0 ? fromProject : existingOwn;
    }

    // Follow ledgerService logic for intent
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
    const intent = mostCommon(intentValues) || 'GENERAL';

    const aiResponse = await summarize(buildTodoPrompt(
      nonInternalMessages,
      meta.title,
      projectName,
      anchorDate,
      existingForDedup.map(t => t.text)
    ));
    const extracted = parseTodoResponse(aiResponse, anchorDate);

    // Programmatic dedup as a backstop in case the model repeats an existing item anyway.
    const newCandidates = extracted.filter(item =>
      !existingForDedup.some(existing => isDuplicateTodoText(item.text, existing.text))
    );

    const now = new Date().toISOString();
    const newTodos: Todo[] = newCandidates.map(item => ({
      id: `todo-${crypto.randomUUID()}`,
      conversationId: `conversation-${conversationId}`,
      text: item.text,
      priority: item.priority,
      status: 'open',
      projectId: projectId ? `project-${projectId}` : null,
      projectName,
      intent,
      createdAt: now,
      updatedAt: now,
      dueDate: item.dueDate,
      snoozedUntil: null,
      sourceMessageHint: item.sourceMessageHint,
      calendarStatus: item.dueDate ? 'published' : 'pending',
      startTime: null,
      endTime: null,
      location: null,
      url: null,
      notes: null,
      alarms: [],
      recurrence: null,
      allDay: true,
    }));

    const merged = [...existingOwn, ...newTodos];
    atomicWrite(todoPath(conversationId), JSON.stringify(merged, null, 2));
    return merged;
  } catch (err) {
    logger.warn(`todoService.extractAndSave failed for ${conversationId}:`, err);
    // Leave existing todos for this conversation untouched on failure — never wipe on error.
    return existingOwn;
  }
}

export async function getTodos(conversationId: string): Promise<Todo[]> {
  const p = todoPath(conversationId);
  if (!fs.existsSync(p)) return [];
  try {
    const content = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      logger.warn(`todoService.getTodos: ${p} does not contain an array`);
      return [];
    }
    return parsed as Todo[];
  } catch (err) {
    logger.warn(`todoService.getTodos: failed to parse ${p}`, err);
    return [];
  }
}

export async function getAllTodos(): Promise<Todo[]> {
  const all = await getAllTodosWithStatus();
  return all.filter(t => t.status !== 'done');
}

export async function getAllTodosWithStatus(): Promise<Todo[]> {
  const base = dataDir();
  if (!fs.existsSync(base)) return [];

  const results: Todo[] = [];
  const entries = fs.readdirSync(base);

  for (const name of entries) {
    if (!name.startsWith('conversation-')) continue;
    const fullPath = path.join(base, name);
    if (!fs.statSync(fullPath).isDirectory()) continue;

    const id = name.slice('conversation-'.length);
    const todos = await getTodos(id);
    results.push(...todos);
  }

  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Flips any `snoozed` todo whose `snoozedUntil` date has passed back to `open`.
 * Returns the number of todos woken up.
 */
export async function wakeSnoozedTodos(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const all = await getAllTodosWithStatus();
  const isDue = (t: Todo) => t.status === 'snoozed' && !!t.snoozedUntil && t.snoozedUntil <= today;

  const conversationIds = new Set(
    all.filter(isDue).map(t => t.conversationId.replace(/^conversation-/, ''))
  );

  let wokenCount = 0;
  for (const conversationId of conversationIds) {
    const todos = await getTodos(conversationId);
    let changed = false;
    const updated = todos.map(t => {
      if (isDue(t)) {
        changed = true;
        wokenCount++;
        return { ...t, status: 'open' as const, snoozedUntil: null, updatedAt: new Date().toISOString() };
      }
      return t;
    });
    if (changed) {
      atomicWrite(todoPath(conversationId), JSON.stringify(updated, null, 2));
    }
  }
  return wokenCount;
}

export async function updateTodo(
  conversationId: string,
  todoId: string,
  updates: TodoUpdateFields
): Promise<Todo> {
  const todos = await getTodos(conversationId);
  const idx = todos.findIndex(t => t.id === todoId);
  if (idx === -1) {
    throw new Error('Todo not found');
  }

  const merged = { ...todos[idx], ...updates, updatedAt: new Date().toISOString() };

  // Auto-publish when dueDate is set
  if (merged.dueDate && merged.calendarStatus === 'pending') {
    merged.calendarStatus = 'published';
  }
  // Auto-unpublish when dueDate is cleared
  if (!merged.dueDate && merged.calendarStatus === 'published') {
    merged.calendarStatus = 'pending';
  }

  todos[idx] = merged;
  atomicWrite(todoPath(conversationId), JSON.stringify(todos, null, 2));
  return merged;
}

export async function deleteTodo(conversationId: string, todoId: string): Promise<void> {
  const todos = await getTodos(conversationId);
  const filtered = todos.filter(t => t.id !== todoId);
  if (filtered.length === todos.length) throw new Error('Todo not found');
  const filePath = todoPath(conversationId);
  const tmp = filePath + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(filtered, null, 2), 'utf8');
  await fs.promises.rename(tmp, filePath);
}

export async function createTodoFromLoop(loop: OpenLoop): Promise<Todo> {
  const conversationId = loop.conversationId.replace(/^conversation-/, '');
  const existing = await getTodos(conversationId);
  const todo: Todo = {
    id: 'todo-' + crypto.randomUUID(),
    conversationId: `conversation-${conversationId}`,
    text: loop.goal || `Follow up on: ${loop.title}`,
    priority: 'soon',
    status: 'open',
    projectId: loop.projectId,
    projectName: loop.projectName,
    intent: loop.intent,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueDate: null,
    snoozedUntil: null,
    sourceMessageHint: `Created from open loop: "${loop.title}"`,
    calendarStatus: 'pending',
    startTime: null,
    endTime: null,
    location: null,
    url: null,
    notes: null,
    alarms: [],
    recurrence: null,
    allDay: true,
  };

  const updated = [...existing, todo];
  atomicWrite(todoPath(conversationId), JSON.stringify(updated, null, 2));
  return todo;
}
