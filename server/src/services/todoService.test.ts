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

  describe('updateTodo()', () => {
    it('updates todo fields and updatedAt', async () => {
      const initialTodo = {
        id: 'todo-1',
        text: 'Initial',
        status: 'open',
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
