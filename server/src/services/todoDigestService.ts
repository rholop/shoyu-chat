import fs from 'fs/promises';
import path from 'path';
import * as todoService from './todoService';
import { dataDir } from '../storage';
import { TodoDigestReport, TodoDigestItem } from '../types';
import { getDateDaysAgo } from '../utils/dateHelpers';

export type { TodoDigestReport, TodoDigestItem };

/**
 * Assembles to-do statistics for weekly digest consumption.
 */
export async function buildTodoDigestReport(): Promise<TodoDigestReport> {
  const allTodos = await todoService.getAllTodosWithStatus();
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = getDateDaysAgo(7);

  const createdThisWeek: TodoDigestItem[] = [];
  const completedThisWeek: TodoDigestItem[] = [];
  const overdue: TodoDigestItem[] = [];

  for (const todo of allTodos) {
    const conversationTitle = await getConversationTitle(todo.conversationId.replace(/^conversation-/, ''));
    const item: TodoDigestItem = {
      text: todo.text,
      priority: todo.priority,
      conversationTitle,
      projectName: todo.projectName,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      dueDate: todo.dueDate
    };

    // Created this week
    if (todo.createdAt.slice(0, 10) >= sevenDaysAgo) {
      createdThisWeek.push(item);
    }

    // Completed this week
    if (todo.status === 'done' && todo.updatedAt.slice(0, 10) >= sevenDaysAgo) {
      completedThisWeek.push(item);
    }

    // Overdue
    if (todo.status === 'open') {
      const hasPastDueDate = todo.dueDate && todo.dueDate < today;
      const isStaleNow = todo.priority === 'now' && todo.createdAt.slice(0, 10) < sevenDaysAgo;
      if (hasPastDueDate || isStaleNow) {
        overdue.push(item);
      }
    }
  }

  const totalOpen = allTodos.filter(t => t.status === 'open').length;
  const totalDone = allTodos.filter(t => t.status === 'done').length;

  return {
    createdThisWeek: createdThisWeek.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    completedThisWeek: completedThisWeek.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    overdue: overdue.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), // oldest overdue first
    totalOpen,
    totalDone
  };
}

/**
 * Local helper to resolve conversation title from meta.json
 */
async function getConversationTitle(conversationId: string): Promise<string> {
  try {
    const metaPath = path.join(dataDir(), `conversation-${conversationId}`, 'meta.json');
    const content = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(content);
    return meta.title ?? 'Untitled conversation';
  } catch {
    return 'Untitled conversation';
  }
}
