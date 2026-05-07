import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as loopsApi from './loops';

describe('loops API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('getLoops calls /api/loops without params when no filters', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ loops: [], total: 0 }),
    } as any);

    await loopsApi.getLoops();
    expect(fetch).toHaveBeenCalledWith('/api/loops', expect.any(Object));
  });

  it('getLoops({ projectId: "X" }) appends ?projectId=X', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ loops: [], total: 0 }),
    } as any);

    await loopsApi.getLoops({ projectId: 'X' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('projectId=X'), expect.any(Object));
  });

  it('getLoops({ age: 7 }) appends ?age=7', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ loops: [], total: 0 }),
    } as any);

    await loopsApi.getLoops({ age: 7 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('age=7'), expect.any(Object));
  });

  it('snoozeLoop sends POST with { snoozedUntil }', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as any);

    await loopsApi.snoozeLoop('1', '2024-01-01');
    expect(fetch).toHaveBeenCalledWith('/api/loops/1/snooze', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ snoozedUntil: '2024-01-01' }),
    }));
  });

  it('resolveLoop sends POST to correct URL', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as any);

    await loopsApi.resolveLoop('1');
    expect(fetch).toHaveBeenCalledWith('/api/loops/1/resolve', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('createTodoFromLoop sends POST and returns todo', async () => {
    const mockTodo = { id: 'todo-1' };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ todo: mockTodo }),
    } as any);

    const result = await loopsApi.createTodoFromLoop('1');
    expect(fetch).toHaveBeenCalledWith('/api/loops/1/todo', expect.objectContaining({
      method: 'POST',
    }));
    expect(result).toEqual(mockTodo);
  });
});
