import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../api/conversations', () => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  updateConversationTitle: vi.fn(),
}));

import {
  listConversations,
  createConversation,
  deleteConversation,
  updateConversationTitle,
} from '../api/conversations';
import { useConversations } from './useConversations';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const conversations = [
  { id: 'conv-1', title: 'Chat 1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', model_last_used: null },
];

describe('useConversations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns conversations from listConversations', async () => {
    vi.mocked(listConversations).mockResolvedValue(conversations);
    const { result } = renderHook(() => useConversations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(result.current.conversations[0].id).toBe('conv-1');
  });

  it('returns empty array while loading', () => {
    vi.mocked(listConversations).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useConversations(), { wrapper: makeWrapper() });
    expect(result.current.conversations).toEqual([]);
  });

  it('create calls createConversation', async () => {
    vi.mocked(listConversations).mockResolvedValue([]);
    const newConv = { id: 'conv-new', title: 'New Conversation', created_at: '', updated_at: '', model_last_used: null };
    vi.mocked(createConversation).mockResolvedValue(newConv);
    const { result } = renderHook(() => useConversations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => { await result.current.create(); });
    expect(createConversation).toHaveBeenCalled();
  });

  it('remove calls deleteConversation', async () => {
    vi.mocked(listConversations).mockResolvedValue(conversations);
    vi.mocked(deleteConversation).mockResolvedValue(undefined);
    const { result } = renderHook(() => useConversations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    act(() => { result.current.remove('conv-1'); });
    await waitFor(() => expect(deleteConversation).toHaveBeenCalledWith('conv-1'));
  });

  it('rename calls updateConversationTitle', async () => {
    vi.mocked(listConversations).mockResolvedValue(conversations);
    vi.mocked(updateConversationTitle).mockResolvedValue(undefined);
    const { result } = renderHook(() => useConversations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    act(() => { result.current.rename('conv-1', 'New Title'); });
    await waitFor(() =>
      expect(updateConversationTitle).toHaveBeenCalledWith('conv-1', 'New Title'),
    );
  });
});
