import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

vi.mock('../api/conversations', () => ({
  getConversation: vi.fn(),
}));

vi.mock('../api/chat', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('../api/insights', () => ({
  findSimilar: vi.fn().mockResolvedValue({ matches: [] }),
}));

import { getConversation } from '../api/conversations';
import { sendMessage } from '../api/chat';
import { findSimilar } from '../api/insights';
import { useChat } from './useChat';
import { useChatStore } from '../store/chatStore';
import { Message, Intent, SimilarMatch } from '../types';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 1, conversation_id: 'conv-1', role: 'user', content: 'Hello',
  model_used: null, created_at: '2026-01-01T00:00:00Z', ...overrides,
});

const convData = {
  id: 'conv-1', title: 'Chat', created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z', model_last_used: null,
  messages: [makeMessage()],
};

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      activeConversationId: null, messages: [], streamingContent: '',
      isStreaming: false, streamError: null, selectedIntent: Intent.CODING, intentLocked: false,
    });
  });

  it('fetches messages for a conversationId', async () => {
    vi.mocked(getConversation).mockResolvedValue(convData);
    const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
  });

  it('returns empty messages when conversationId is null', () => {
    const { result } = renderHook(() => useChat(null), { wrapper: makeWrapper() });
    expect(result.current.messages).toEqual([]);
  });

  it('send streams tokens and finalizes', async () => {
    vi.mocked(getConversation).mockResolvedValue({ ...convData, messages: [] });
    async function* fakeStream() {
      yield { type: 'token' as const, content: 'Hello' };
      yield { type: 'done' as const, model: 'groq-chat', conversationId: 'conv-1', intent: Intent.CODING };
    }
    vi.mocked(sendMessage).mockReturnValue(fakeStream());

    const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });

    const optimistic = makeMessage({ role: 'user', content: 'hey' });
    await act(async () => {
      await result.current.send('hey', optimistic);
    });

    // 'hey' has no strong signal → detectIntent falls back to CODING
    expect(sendMessage).toHaveBeenCalledWith('conv-1', 'hey', [], Intent.CODING);
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it('sets streamError on send failure', async () => {
    vi.mocked(getConversation).mockResolvedValue({ ...convData, messages: [] });
    async function* errorStream() {
      yield { type: 'error' as const, message: 'quota exceeded' };
    }
    vi.mocked(sendMessage).mockReturnValue(errorStream());

    const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.send('hey', makeMessage());
    });

    expect(useChatStore.getState().streamError).toBe('quota exceeded');
  });

  it('auto-detects intent from message content (summarize → SUMMARIZING)', async () => {
    vi.mocked(getConversation).mockResolvedValue({ ...convData, messages: [] });
    async function* fakeStream() {
      yield { type: 'done' as const, model: 'gemini', conversationId: 'conv-1', intent: Intent.SUMMARIZING };
    }
    vi.mocked(sendMessage).mockReturnValue(fakeStream());

    const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.send('summarize this article for me', makeMessage());
    });

    expect(sendMessage).toHaveBeenCalledWith(
      'conv-1', 'summarize this article for me', [], Intent.SUMMARIZING,
    );
  });

  it('respects manual intent lock when intentLocked=true', async () => {
    vi.mocked(getConversation).mockResolvedValue({ ...convData, messages: [] });
    async function* fakeStream() {
      yield { type: 'done' as const, model: 'groq-chat', conversationId: 'conv-1', intent: Intent.DEBUGGING };
    }
    vi.mocked(sendMessage).mockReturnValue(fakeStream());

    // User manually selected DEBUGGING
    useChatStore.setState({ selectedIntent: Intent.DEBUGGING, intentLocked: true });

    const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
    await act(async () => {
      // Content would normally auto-detect as SUMMARIZING
      await result.current.send('summarize this article', makeMessage());
    });

    // Should use locked DEBUGGING, not auto-detected SUMMARIZING
    expect(sendMessage).toHaveBeenCalledWith(
      'conv-1', 'summarize this article', [], Intent.DEBUGGING,
    );
  });

  it('unlocks intent after send completes', async () => {
    vi.mocked(getConversation).mockResolvedValue({ ...convData, messages: [] });
    async function* fakeStream() {
      yield { type: 'done' as const, model: 'gemini', conversationId: 'conv-1', intent: Intent.WEB_SEARCH };
    }
    vi.mocked(sendMessage).mockReturnValue(fakeStream());

    useChatStore.setState({ selectedIntent: Intent.WEB_SEARCH, intentLocked: true });

    const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.send('search for news', makeMessage());
    });

    expect(useChatStore.getState().intentLocked).toBe(false);
  });

  it('send is a no-op when conversationId is null', async () => {
    const { result } = renderHook(() => useChat(null), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.send('hey', makeMessage());
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sets streamError when sendMessage throws (network failure)', async () => {
    vi.mocked(getConversation).mockResolvedValue({ ...convData, messages: [] });
    vi.mocked(sendMessage).mockImplementation(async function* () {
      throw new Error('Failed to fetch');
    } as any);

    const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.send('hey', makeMessage());
    });

    expect(useChatStore.getState().streamError).toBe('Failed to fetch');
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  describe('nudges via findSimilar', () => {
    async function* doneStream() {
      yield { type: 'done' as const, model: 'groq-chat', conversationId: 'conv-1', intent: Intent.CODING };
    }

    beforeEach(() => {
      vi.mocked(getConversation).mockResolvedValue({ ...convData, messages: [] });
      vi.mocked(sendMessage).mockReturnValue(doneStream());
      vi.mocked(findSimilar).mockResolvedValue({ matches: [] });
      useChatStore.setState({ firstMessageSent: new Set(), nudges: [] });
    });

    it('calls findSimilar on the first message of a new conversation', async () => {
      const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
      await act(async () => {
        await result.current.send('hey', makeMessage());
      });
      expect(findSimilar).toHaveBeenCalledWith('hey', 'conv-1');
    });

    it('does not call findSimilar when the conversation already has messages', async () => {
      vi.mocked(getConversation).mockResolvedValue({ ...convData, messages: [makeMessage()] });
      const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
      await waitFor(() => expect(result.current.messages).toHaveLength(1));
      await act(async () => {
        await result.current.send('second message', makeMessage());
      });
      expect(findSimilar).not.toHaveBeenCalled();
    });

    it('does not call findSimilar a second time once firstMessageSent is marked', async () => {
      useChatStore.setState({ firstMessageSent: new Set(['conv-1']) });
      const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
      await act(async () => {
        await result.current.send('second send', makeMessage());
      });
      expect(findSimilar).not.toHaveBeenCalled();
    });

    it('sets nudges in the store when findSimilar returns matches', async () => {
      const matches: SimilarMatch[] = [
        { conversationId: 'c2', title: 'Old Convo', goal: 'Do stuff', date: '2026-01-01', resolved: false, score: 0.9, topics: ['react'] },
      ];
      vi.mocked(findSimilar).mockResolvedValue({ matches });
      const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
      await act(async () => {
        await result.current.send('hey', makeMessage());
      });
      await waitFor(() => expect(useChatStore.getState().nudges).toHaveLength(1));
      expect(useChatStore.getState().nudges[0].title).toBe('Old Convo');
    });

    it('does not set nudges when findSimilar returns empty matches', async () => {
      vi.mocked(findSimilar).mockResolvedValue({ matches: [] });
      const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
      await act(async () => {
        await result.current.send('hey', makeMessage());
      });
      await act(async () => { /* flush microtasks */ });
      expect(useChatStore.getState().nudges).toHaveLength(0);
    });

    it('marks the conversation as having had its first message sent', async () => {
      const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
      await act(async () => {
        await result.current.send('hey', makeMessage());
      });
      expect(useChatStore.getState().firstMessageSent.has('conv-1')).toBe(true);
    });

    it('does not throw when findSimilar rejects (fail silently)', async () => {
      vi.mocked(findSimilar).mockRejectedValue(new Error('network error'));
      const { result } = renderHook(() => useChat('conv-1'), { wrapper: makeWrapper() });
      await expect(
        act(async () => { await result.current.send('hey', makeMessage()); })
      ).resolves.not.toThrow();
      expect(useChatStore.getState().streamError).toBeNull();
    });
  });
});
