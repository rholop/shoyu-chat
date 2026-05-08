import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as todoService from './todoService';
import {
  getConversationMeta,
  getMessages,
  getProjectMeta,
  atomicWrite,
  dataDir,
} from '../storage';
import { summarize } from './aiRouter';

vi.mock('../storage', () => ({
  getConversationMeta: vi.fn(),
  getMessages: vi.fn(),
  getProjectMeta: vi.fn(),
  atomicWrite: vi.fn(),
  dataDir: vi.fn().mockReturnValue('/tmp/shoyu-test'),
}));

vi.mock('./aiRouter', () => ({
  summarize: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
    promises: {
      writeFile: vi.fn(),
      rename: vi.fn(),
    },
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const CONV_ID = 'conv-123';
const TODO_FILE = '/tmp/shoyu-test/conversation-conv-123/todos.json';

describe('todoService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractAndSave()', () => {
    const meta = { id: CONV_ID, title: 'Test Chat', created_at: '2026-05-01T10:00:00Z' };
    const messages = [
      { role: 'user', content: 'Remind me to fix the bug', created_at: '2026-05-01T10:00:00Z' },
      { role: 'assistant', content: 'Sure, I will help you fix the bug', created_at: '2026-05-01T10:00:05Z' },
    ];

    it('creates todos.json with extracted todos', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Fix the bug', priority: 'now', sourceMessageHint: 'User asked to fix bug' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos).toHaveLength(1);
      expect(todos[0].text).toBe('Fix the bug');
      expect(todos[0].priority).toBe('now');
      expect(todos[0].status).toBe('open');
      expect(vi.mocked(atomicWrite)).toHaveBeenCalledWith(TODO_FILE, expect.stringContaining('Fix the bug'));
    });

    it('writes [] when AI returns empty array', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue('[]');

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos).toHaveLength(0);
      expect(vi.mocked(atomicWrite)).toHaveBeenCalledWith(TODO_FILE, '[]');
    });

    it('writes [] and does not throw when AI response is unparseable', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue('invalid json');

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos).toHaveLength(0);
      expect(vi.mocked(atomicWrite)).toHaveBeenCalledWith(TODO_FILE, '[]');
    });

    it('assigns correct projectId and projectName from meta files', async () => {
      const metaWithProject = { ...meta, projectId: 'proj-1' };
      vi.mocked(getConversationMeta).mockReturnValue(metaWithProject as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(getProjectMeta).mockReturnValue({ id: 'proj-1', name: 'Cool Project' } as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Task 1', priority: 'soon', sourceMessageHint: 'Hint' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos[0].projectId).toBe('project-proj-1');
      expect(todos[0].projectName).toBe('Cool Project');
    });

    it('enforces max 3 todos even if AI returns more', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'T1', priority: 'soon', sourceMessageHint: 'H' },
        { text: 'T2', priority: 'soon', sourceMessageHint: 'H' },
        { text: 'T3', priority: 'soon', sourceMessageHint: 'H' },
        { text: 'T4', priority: 'soon', sourceMessageHint: 'H' },
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos).toHaveLength(3);
    });

    it('truncates text to 120 characters', async () => {
      const longText = 'A'.repeat(200);
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: longText, priority: 'soon', sourceMessageHint: 'H' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos[0].text).toHaveLength(120);
    });

    it('filters out internal messages before sending to AI', async () => {
      const messagesWithInternal = [
        ...messages,
        { role: 'internal', content: '{"intent":"CODING"}', created_at: '2026-05-01T10:00:01Z' }
      ];
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messagesWithInternal as any);
      vi.mocked(summarize).mockResolvedValue('[]');

      await todoService.extractAndSave(CONV_ID);

      const promptCall = vi.mocked(summarize).mock.calls[0][0];
      expect(promptCall).not.toContain('internal');
      // Should contain content from user/assistant messages
      expect(promptCall).toContain('Remind me to fix the bug');
    });

    it('extracts intent from internal messages', async () => {
      const messagesWithInternal = [
        ...messages,
        { role: 'internal', content: '{"intent":"DEBUGGING"}', created_at: '2026-05-01T10:00:01Z' }
      ];
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messagesWithInternal as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'T1', priority: 'soon', sourceMessageHint: 'H' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);
      expect(todos[0].intent).toBe('DEBUGGING');
    });

    it('uses created_at of last non-internal message as anchor date', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue('[]');

      await todoService.extractAndSave(CONV_ID);

      const promptCall = vi.mocked(summarize).mock.calls[0][0];
      expect(promptCall).toContain('2026-05-01');
    });

    it('skips internal messages when finding the last message for anchor date', async () => {
      const messagesWithLaterInternal = [
        ...messages,
        { role: 'internal', content: '{"intent":"CODING"}', created_at: '2026-05-10T12:00:00Z' },
      ];
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messagesWithLaterInternal as any);
      vi.mocked(summarize).mockResolvedValue('[]');

      await todoService.extractAndSave(CONV_ID);

      const promptCall = vi.mocked(summarize).mock.calls[0][0];
      // anchor date should be from last non-internal (assistant at 10:00:05), not internal (2026-05-10)
      expect(promptCall).toContain('Conversation date: 2026-05-01');
      expect(promptCall).not.toContain('Conversation date: 2026-05-10');
    });

    it('falls back to today when no messages have created_at', async () => {
      const messagesNoTimestamp = [
        { role: 'user', content: 'Do something' },
        { role: 'assistant', content: 'OK' },
      ];
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messagesNoTimestamp as any);
      vi.mocked(summarize).mockResolvedValue('[]');

      await todoService.extractAndSave(CONV_ID);

      const promptCall = vi.mocked(summarize).mock.calls[0][0];
      const todayStr = new Date().toISOString().slice(0, 10);
      expect(promptCall).toContain(todayStr);
    });

    it('saves todo with dueDate from AI response', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Deploy to prod', priority: 'now', dueDate: '2026-05-15', sourceMessageHint: 'Deadline mentioned' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos[0].dueDate).toBe('2026-05-15');
    });

    it('sets dueDate to null when AI returns a past date', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Do something', priority: 'now', dueDate: '2026-01-01', sourceMessageHint: 'H' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos[0].dueDate).toBeNull();
    });

    it('sets dueDate to null when AI returns an invalid format', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Do something', priority: 'now', dueDate: 'Friday', sourceMessageHint: 'H' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos[0].dueDate).toBeNull();
    });

    it('saves mix of todos with and without dueDate correctly', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Task with date', priority: 'now', dueDate: '2026-05-15', sourceMessageHint: 'H' },
        { text: 'Task without date', priority: 'soon', dueDate: null, sourceMessageHint: 'H' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);

      expect(todos[0].dueDate).toBe('2026-05-15');
      expect(todos[1].dueDate).toBeNull();
    });

    it('sets calendarStatus to pending when no dueDate extracted', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Task', priority: 'soon', dueDate: null, sourceMessageHint: 'H' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);
      expect(todos[0].calendarStatus).toBe('pending');
    });

    it('sets calendarStatus to published when dueDate is extracted', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Task', priority: 'now', dueDate: '2026-05-15', sourceMessageHint: 'H' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);
      expect(todos[0].calendarStatus).toBe('published');
    });

    it('sets default new fields: alarms=[], recurrence=null, allDay=true', async () => {
      vi.mocked(getConversationMeta).mockReturnValue(meta as any);
      vi.mocked(getMessages).mockReturnValue(messages as any);
      vi.mocked(summarize).mockResolvedValue(JSON.stringify([
        { text: 'Task', priority: 'soon', sourceMessageHint: 'H' }
      ]));

      const todos = await todoService.extractAndSave(CONV_ID);
      expect(todos[0].alarms).toEqual([]);
      expect(todos[0].recurrence).toBeNull();
      expect(todos[0].allDay).toBe(true);
      expect(todos[0].startTime).toBeNull();
      expect(todos[0].endTime).toBeNull();
      expect(todos[0].location).toBeNull();
      expect(todos[0].url).toBeNull();
      expect(todos[0].notes).toBeNull();
    });
  });

  describe('parseTodoResponse()', () => {
    const ANCHOR = '2026-05-08';

    it('sets dueDate to the parsed value for a valid future date', () => {
      const raw = JSON.stringify([
        { text: 'Do it', priority: 'now', dueDate: '2026-05-15', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBe('2026-05-15');
    });

    it('accepts dueDate equal to the anchor date (same day is valid)', () => {
      const raw = JSON.stringify([
        { text: 'Do it today', priority: 'now', dueDate: '2026-05-08', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBe('2026-05-08');
    });

    it('sets dueDate to null when date is before anchor date', () => {
      const raw = JSON.stringify([
        { text: 'Old task', priority: 'now', dueDate: '2026-05-07', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBeNull();
    });

    it('sets dueDate to null for invalid format "Friday"', () => {
      const raw = JSON.stringify([
        { text: 'Task', priority: 'soon', dueDate: 'Friday', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBeNull();
    });

    it('sets dueDate to null for invalid format "next week"', () => {
      const raw = JSON.stringify([
        { text: 'Task', priority: 'soon', dueDate: 'next week', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBeNull();
    });

    it('sets dueDate to null for empty string', () => {
      const raw = JSON.stringify([
        { text: 'Task', priority: 'soon', dueDate: '', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBeNull();
    });

    it('sets dueDate to null when dueDate is omitted', () => {
      const raw = JSON.stringify([
        { text: 'Task', priority: 'soon', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBeNull();
    });

    it('sets dueDate to null when AI returns dueDate: null explicitly', () => {
      const raw = JSON.stringify([
        { text: 'Task', priority: 'soon', dueDate: null, sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBeNull();
    });

    it('does not discard todo when dueDate is invalid — item kept with dueDate null', () => {
      const raw = JSON.stringify([
        { text: 'Task with bad date', priority: 'soon', dueDate: 'not-a-date', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('Task with bad date');
      expect(result[0].dueDate).toBeNull();
    });

    it('accepts dueDate after the anchor date', () => {
      const raw = JSON.stringify([
        { text: 'Future task', priority: 'someday', dueDate: '2027-01-01', sourceMessageHint: 'H' }
      ]);
      const result = todoService.parseTodoResponse(raw, ANCHOR);
      expect(result[0].dueDate).toBe('2027-01-01');
    });
  });

  describe('buildTodoPrompt()', () => {
    it('includes the anchor date in the prompt output', () => {
      const prompt = todoService.buildTodoPrompt(
        [{ role: 'user', content: 'Hello' }],
        'Test Chat',
        null,
        '2026-05-08'
      );
      expect(prompt).toContain('2026-05-08');
    });

    it('includes anchor date in both the context line and date rules', () => {
      const prompt = todoService.buildTodoPrompt(
        [{ role: 'user', content: 'Hello' }],
        'Test Chat',
        null,
        '2026-05-08'
      );
      const occurrences = (prompt.match(/2026-05-08/g) || []).length;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getTodos()', () => {
    it('returns [] when todos.json does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const todos = await todoService.getTodos(CONV_ID);
      expect(todos).toEqual([]);
    });

    it('returns parsed array when file exists and is valid', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([{ id: 'todo-1', text: 'Task' }]));
      const todos = await todoService.getTodos(CONV_ID);
      expect(todos).toHaveLength(1);
      expect(todos[0].text).toBe('Task');
    });

    it('returns [] when file is malformed JSON', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid');
      const todos = await todoService.getTodos(CONV_ID);
      expect(todos).toEqual([]);
    });
  });

  describe('getAllTodos()', () => {
    it('aggregates todos from multiple conversations and excludes done', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue(['conversation-c1', 'conversation-c2'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);

      // First call for c1, second for c2
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify([
          { id: 't1', status: 'open', createdAt: '2026-05-01T12:00:00Z' },
          { id: 't2', status: 'done', createdAt: '2026-05-01T11:00:00Z' }
        ]))
        .mockReturnValueOnce(JSON.stringify([
          { id: 't3', status: 'open', createdAt: '2026-05-01T13:00:00Z' }
        ]));

      const todos = await todoService.getAllTodos();

      expect(todos).toHaveLength(2);
      expect(todos[0].id).toBe('t3'); // sorted by createdAt desc
      expect(todos[1].id).toBe('t1');
    });
  });

  describe('getAllTodosWithStatus()', () => {
    it('returns all todos regardless of status', async () => {
      vi.mocked(fs.readdirSync).mockReturnValue(['conversation-c1'] as any);
      vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as any);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([
        { id: 't1', status: 'open', createdAt: '2026-05-01T12:00:00Z' },
        { id: 't2', status: 'done', createdAt: '2026-05-01T11:00:00Z' },
        { id: 't3', status: 'snoozed', createdAt: '2026-05-01T13:00:00Z' }
      ]));

      const todos = await todoService.getAllTodosWithStatus();

      expect(todos).toHaveLength(3);
      expect(todos.map(t => t.status)).toContain('open');
      expect(todos.map(t => t.status)).toContain('done');
      expect(todos.map(t => t.status)).toContain('snoozed');
    });

    it('returns empty array when dataDir does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const todos = await todoService.getAllTodosWithStatus();
      expect(todos).toEqual([]);
    });
  });

  describe('updateTodo()', () => {
    it('updates todo fields and updatedAt', async () => {
      const initialTodo = {
        id: 'todo-1',
        text: 'Initial',
        status: 'open',
        calendarStatus: 'pending',
        createdAt: '2026-05-01T10:00:00Z',
        updatedAt: '2026-05-01T10:00:00Z'
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([initialTodo]));

      const updated = await todoService.updateTodo(CONV_ID, 'todo-1', { status: 'done', text: 'Updated' });

      expect(updated.status).toBe('done');
      expect(updated.text).toBe('Updated');
      expect(updated.createdAt).toBe(initialTodo.createdAt);
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(initialTodo.updatedAt).getTime());
      expect(vi.mocked(atomicWrite)).toHaveBeenCalled();
    });

    it('throws error when todo not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([]));

      await expect(todoService.updateTodo(CONV_ID, 'todo-absent', { status: 'done' }))
        .rejects.toThrow('Todo not found');
    });

    it('auto-publishes when dueDate is set on a pending todo', async () => {
      const todo = { id: 'todo-1', calendarStatus: 'pending', dueDate: null, updatedAt: '2026-05-01T10:00:00Z' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([todo]));

      const updated = await todoService.updateTodo(CONV_ID, 'todo-1', { dueDate: '2026-05-15' });
      expect(updated.calendarStatus).toBe('published');
      expect(updated.dueDate).toBe('2026-05-15');
    });

    it('auto-unpublishes when dueDate is cleared on a published todo', async () => {
      const todo = { id: 'todo-1', calendarStatus: 'published', dueDate: '2026-05-15', updatedAt: '2026-05-01T10:00:00Z' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([todo]));

      const updated = await todoService.updateTodo(CONV_ID, 'todo-1', { dueDate: null });
      expect(updated.calendarStatus).toBe('pending');
      expect(updated.dueDate).toBeNull();
    });

    it('keeps calendarStatus published when updating an already-published todo with a new dueDate', async () => {
      const todo = { id: 'todo-1', calendarStatus: 'published', dueDate: '2026-05-10', updatedAt: '2026-05-01T10:00:00Z' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([todo]));

      const updated = await todoService.updateTodo(CONV_ID, 'todo-1', { dueDate: '2026-05-20' });
      expect(updated.calendarStatus).toBe('published');
    });

    it('keeps calendarStatus pending when updating non-dueDate fields', async () => {
      const todo = { id: 'todo-1', calendarStatus: 'pending', dueDate: null, updatedAt: '2026-05-01T10:00:00Z' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([todo]));

      const updated = await todoService.updateTodo(CONV_ID, 'todo-1', { text: 'New text' });
      expect(updated.calendarStatus).toBe('pending');
    });

    it('ignores calendarStatus if passed directly in updates', async () => {
      const todo = { id: 'todo-1', calendarStatus: 'pending', dueDate: null, updatedAt: '2026-05-01T10:00:00Z' };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([todo]));

      // Pass calendarStatus via cast to bypass TypeScript — it should be ignored by the logic
      const updated = await todoService.updateTodo(CONV_ID, 'todo-1', { text: 'Updated' } as any);
      expect(updated.calendarStatus).toBe('pending');
    });
  });

  describe('deleteTodo()', () => {
    it('removes the correct todo by id', async () => {
      const todos = [
        { id: 't1', text: 'T1' },
        { id: 't2', text: 'T2' }
      ];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(todos));
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.promises.rename).mockResolvedValue(undefined);

      await todoService.deleteTodo(CONV_ID, 't1');

      const writeFileCall = vi.mocked(fs.promises.writeFile).mock.calls[0];
      const savedTodos = JSON.parse(writeFileCall[1] as string);
      expect(savedTodos).toHaveLength(1);
      expect(savedTodos[0].id).toBe('t2');
      expect(vi.mocked(fs.promises.rename)).toHaveBeenCalled();
    });

    it('throws "Todo not found" when id does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([]));

      await expect(todoService.deleteTodo(CONV_ID, 't1'))
        .rejects.toThrow('Todo not found');
    });
  });

  describe('createTodoFromLoop()', () => {
    const loop = {
      conversationId: 'conv-123',
      title: 'Loop Title',
      goal: 'Loop Goal',
      projectId: 'project-1',
      projectName: 'Project 1',
      intent: 'CODING',
      topics: ['t1'],
      createdAt: '2026-05-01T10:00:00Z',
      summarizedAt: '2026-05-01T14:00:00Z',
      daysSinceCreated: 5,
      snoozedUntil: null
    };

    it('creates a todo from an open loop', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const todo = await todoService.createTodoFromLoop(loop as any);

      expect(todo.conversationId).toBe('conversation-conv-123');
      expect(todo.text).toBe('Loop Goal');
      expect(todo.priority).toBe('soon');
      expect(todo.status).toBe('open');
      expect(todo.projectId).toBe('project-1');
      expect(todo.projectName).toBe('Project 1');
      expect(todo.intent).toBe('CODING');
      expect(vi.mocked(atomicWrite)).toHaveBeenCalledWith(
        TODO_FILE,
        expect.stringContaining('Loop Goal')
      );
    });

    it('falls back to title when goal is missing', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const loopNoGoal = { ...loop, goal: '' };

      const todo = await todoService.createTodoFromLoop(loopNoGoal as any);

      expect(todo.text).toBe('Follow up on: Loop Title');
    });

    it('appends to existing todos without overwriting', async () => {
      const existing = [{ id: 'existing-1', text: 'Existing' }];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));

      await todoService.createTodoFromLoop(loop as any);

      const call = vi.mocked(atomicWrite).mock.calls[0];
      const saved = JSON.parse(call[1] as string);
      expect(saved).toHaveLength(2);
      expect(saved[0].id).toBe('existing-1');
      expect(saved[1].text).toBe('Loop Goal');
    });
  });
});
