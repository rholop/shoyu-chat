import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../api/projects', () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  updateProjectContext: vi.fn(),
  assignConversation: vi.fn(),
}));

import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  updateProjectContext,
  assignConversation,
} from '../api/projects';
import { useProjects, useProject } from './useProjects';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const PROJECT = { id: 'p1', name: 'My Project', description: 'Desc', created_at: '2026-01-01T00:00:00Z', conversationCount: 2 };
const PROJECT_DETAIL = { id: 'p1', name: 'My Project', description: 'Desc', created_at: '2026-01-01T00:00:00Z', contextDoc: '# ctx', summary: 'sum', conversations: [] };

describe('useProjects', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns projects from listProjects', async () => {
    vi.mocked(listProjects).mockResolvedValue([PROJECT]);
    const { result } = renderHook(() => useProjects(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.projects).toHaveLength(1));
    expect(result.current.projects[0].id).toBe('p1');
  });

  it('returns empty array while loading', () => {
    vi.mocked(listProjects).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useProjects(), { wrapper: makeWrapper() });
    expect(result.current.projects).toEqual([]);
  });

  it('create calls createProject', async () => {
    vi.mocked(listProjects).mockResolvedValue([]);
    vi.mocked(createProject).mockResolvedValue({ id: 'new' });
    const { result } = renderHook(() => useProjects(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.create({ name: 'Test', description: 'Desc' }); });
    expect(createProject).toHaveBeenCalledWith('Test', 'Desc');
  });

  it('remove calls deleteProject', async () => {
    vi.mocked(listProjects).mockResolvedValue([PROJECT]);
    vi.mocked(deleteProject).mockResolvedValue(undefined);
    const { result } = renderHook(() => useProjects(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    act(() => { result.current.remove('p1'); });
    await waitFor(() => expect(deleteProject).toHaveBeenCalledWith('p1'));
  });

  it('update calls updateProject', async () => {
    vi.mocked(listProjects).mockResolvedValue([PROJECT]);
    vi.mocked(updateProject).mockResolvedValue(undefined);
    const { result } = renderHook(() => useProjects(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    act(() => { result.current.update('p1', { name: 'New Name' }); });
    await waitFor(() => expect(updateProject).toHaveBeenCalledWith('p1', { name: 'New Name' }));
  });
});

describe('useProject', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns project detail from getProject', async () => {
    vi.mocked(getProject).mockResolvedValue(PROJECT_DETAIL);
    const { result } = renderHook(() => useProject('p1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project).not.toBeNull());
    expect(result.current.project?.id).toBe('p1');
    expect(result.current.project?.contextDoc).toBe('# ctx');
  });

  it('returns null while loading', () => {
    vi.mocked(getProject).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useProject('p1'), { wrapper: makeWrapper() });
    expect(result.current.project).toBeNull();
  });

  it('updateContext calls updateProjectContext', async () => {
    vi.mocked(getProject).mockResolvedValue(PROJECT_DETAIL);
    vi.mocked(updateProjectContext).mockResolvedValue(undefined);
    const { result } = renderHook(() => useProject('p1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project).not.toBeNull());

    act(() => { result.current.updateContext('# new context'); });
    await waitFor(() => expect(updateProjectContext).toHaveBeenCalledWith('p1', '# new context'));
  });

  it('assign calls assignConversation', async () => {
    vi.mocked(getProject).mockResolvedValue(PROJECT_DETAIL);
    vi.mocked(assignConversation).mockResolvedValue(undefined);
    const { result } = renderHook(() => useProject('p1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project).not.toBeNull());

    act(() => { result.current.assign('conv-1', 'p1'); });
    await waitFor(() => expect(assignConversation).toHaveBeenCalledWith('conv-1', 'p1'));
  });
});
