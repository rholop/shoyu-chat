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

function buildTodoPrompt(
  messages: { role: string; content: string }[],
  conversationTitle: string,
  projectName: string | null
): string {
  const context = projectName ? `This conversation is part of the project: "${projectName}".` : '';
  const history = messages
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
    .join('\n\n');

  return `You are extracting actionable to-do items from an AI conversation.

Conversation title: "${conversationTitle}"
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

Respond ONLY with a JSON array. No explanation, no markdown fences, no preamble.

Example output:
[
  {
    "text": "Set up rclone R2 sync script on the VPS",
    "priority": "soon",
    "sourceMessageHint": "You discussed the R2 backup approach but did not complete the setup steps"
  },
  {
    "text": "Add NVIDIA_API_KEY to the production .env file",
    "priority": "now",
    "sourceMessageHint": "You noted the NVIDIA provider would fail without this key in production"
  }
]`;
}

function parseTodoResponse(raw: string): Pick<Todo, 'text' | 'priority' | 'sourceMessageHint'>[] {
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
      .map(item => ({
        text: item.text.slice(0, 120), // enforce max length
        priority: item.priority as TodoPriority,
        sourceMessageHint: item.sourceMessageHint
      }));
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
    const filteredMessages = messages.filter(m => m.role !== 'internal');

    if (filteredMessages.length === 0) {
      const empty: Todo[] = [];
      atomicWrite(todoPath(conversationId), JSON.stringify(empty, null, 2));
      return empty;
    }

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

    const aiResponse = await summarize(buildTodoPrompt(filteredMessages, meta.title, projectName));
    const extracted = parseTodoResponse(aiResponse);

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
      dueDate: null,
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
