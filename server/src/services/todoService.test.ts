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
});
