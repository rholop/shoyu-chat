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
import { Todo, TodoPriority, Intent, OpenLoop } from '../types';
import { summarize } from './aiRouter';
import { logger } from '../utils/logger';

function todoPath(conversationId: string) {
  return path.join(dataDir(), `conversation-${conversationId}`, 'todos.json');
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
  anchorDate: string
): string {
  const context = projectName ? `This conversation is part of the project: "${projectName}".` : '';
  const history = messages
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n\n');

  return `You are extracting actionable to-do items from an AI conversation.

Conversation title: "${conversationTitle}"
Conversation date: ${anchorDate}
${context}

Conversation:
${history}

---

Extract 0 to 3 concrete, specific to-do items from this conversation.

Rules:
- Only extract items that are clearly actionable — something the user could actually do.
- Do not extract vague intentions like "think about X" or "explore Y someday."
- Do not extract things the user already completed during the conversation.
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
  try {
    const meta = getConversationMeta(conversationId);
    if (!meta) {
      logger.warn(`todoService.extractAndSave: conversation ${conversationId} not found`);
      return [];
    }

    const messages = getMessages(conversationId);
    const nonInternalMessages = messages.filter(m => m.role !== 'internal');

    if (nonInternalMessages.length === 0) {
      const empty: Todo[] = [];
      atomicWrite(todoPath(conversationId), JSON.stringify(empty, null, 2));
      return empty;
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

    const aiResponse = await summarize(buildTodoPrompt(nonInternalMessages, meta.title, projectName, anchorDate));
    const extracted = parseTodoResponse(aiResponse, anchorDate);

    const now = new Date().toISOString();
    const todos: Todo[] = extracted.map(item => ({
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
      sourceMessageHint: item.sourceMessageHint
    }));

    atomicWrite(todoPath(conversationId), JSON.stringify(todos, null, 2));
    return todos;
  } catch (err) {
    logger.warn(`todoService.extractAndSave failed for ${conversationId}:`, err);
    // Write empty array on failure to ensure file exists as per requirements
    try {
      const empty: Todo[] = [];
      atomicWrite(todoPath(conversationId), JSON.stringify(empty, null, 2));
    } catch (writeErr) {
      logger.error(`todoService: failed to write empty todos.json for ${conversationId}`, writeErr);
    }
    return [];
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

export async function updateTodo(
  conversationId: string,
  todoId: string,
  updates: Partial<Pick<Todo, 'status' | 'priority' | 'dueDate' | 'snoozedUntil' | 'text'>>
): Promise<Todo> {
  const todos = await getTodos(conversationId);
  const idx = todos.findIndex(t => t.id === todoId);
  if (idx === -1) {
    throw new Error('Todo not found');
  }

  const updatedTodo = {
    ...todos[idx],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  todos[idx] = updatedTodo;
  atomicWrite(todoPath(conversationId), JSON.stringify(todos, null, 2));
  return updatedTodo;
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
    sourceMessageHint: `Created from open loop: "${loop.title}"`
  };

  const updated = [...existing, todo];
  atomicWrite(todoPath(conversationId), JSON.stringify(updated, null, 2));
  return todo;
}
