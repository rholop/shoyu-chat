import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

vi.mock('../../hooks/useChat', () => ({ useChat: vi.fn() }));
vi.mock('../../hooks/useFileUpload', () => ({
  useFileUpload: () => ({
    attachments: [], uploading: false, uploadError: null,
    upload: vi.fn(), remove: vi.fn(), clear: vi.fn(),
  }),
}));
vi.mock('../../store/chatStore', () => ({ useChatStore: vi.fn() }));
vi.mock('./MessageBubble', () => ({
  default: ({ message }: { message: { content: string } }) =>
    createElement('div', { 'data-testid': 'message-bubble' }, message.content),
}));
vi.mock('./MessageInput', () => ({
  default: ({ disabled }: { disabled: boolean }) =>
    createElement('button', { disabled, 'data-testid': 'message-input' }, 'Send'),
}));
vi.mock('./NudgeBanner', () => ({ NudgeBanner: () => null }));

import ChatView from './ChatView';
import { useChat } from '../../hooks/useChat';
import { useChatStore } from '../../store/chatStore';
import { Message } from '../../types';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 1, conversation_id: 'c1', role: 'user', content: 'Hello',
  model_used: null, created_at: '2026-01-01T00:00:00Z', ...overrides,
});

const storeDefaults = {
  messages: [], streamingContent: '', isStreaming: false, streamError: null,
};

function wrap(ui: React.ReactNode) {
  return render(createElement(MemoryRouter, null, ui));
}

describe('ChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useChatStore).mockReturnValue(storeDefaults as any);
  });

  it('shows a loading spinner when isLoading is true', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: true, send: vi.fn() });
    const { container } = wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty-state prompt when there are no messages and not streaming', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it('renders messages from the store when the store is populated', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    vi.mocked(useChatStore).mockReturnValue({
      ...storeDefaults, messages: [makeMessage({ content: 'Store message' })],
    } as any);
    wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(screen.getByText('Store message')).toBeInTheDocument();
  });

  it('renders persisted messages when the store is empty', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [makeMessage({ content: 'Persisted message' })],
      conversation: undefined, isLoading: false, send: vi.fn(),
    });
    wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(screen.getByText('Persisted message')).toBeInTheDocument();
  });

  it('renders a streaming bubble when isStreaming with partial content', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    vi.mocked(useChatStore).mockReturnValue({
      ...storeDefaults, isStreaming: true, streamingContent: 'Partial…',
    } as any);
    wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(screen.getByText('Partial…')).toBeInTheDocument();
  });

  it('renders a typing-indicator when isStreaming with no content yet', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    vi.mocked(useChatStore).mockReturnValue({
      ...storeDefaults, isStreaming: true, streamingContent: '',
    } as any);
    const { container } = wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(container.querySelector('.animate-bounce')).toBeInTheDocument();
  });

  it('renders the stream error when streamError is set', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    vi.mocked(useChatStore).mockReturnValue({
      ...storeDefaults, streamError: 'Something went wrong',
    } as any);
    wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('filters out internal messages from display', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    vi.mocked(useChatStore).mockReturnValue({
      ...storeDefaults,
      messages: [
        makeMessage({ role: 'user', content: 'Visible' }),
        makeMessage({ id: 2, role: 'internal', content: 'Hidden' }),
      ],
    } as any);
    wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(screen.getByText('Visible')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('disables MessageInput while isStreaming', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    vi.mocked(useChatStore).mockReturnValue({ ...storeDefaults, isStreaming: true } as any);
    wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(screen.getByTestId('message-input')).toBeDisabled();
  });

  it('enables MessageInput when not streaming', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    wrap(createElement(ChatView, { conversationId: 'c1' }));
    expect(screen.getByTestId('message-input')).not.toBeDisabled();
  });

  it('renders mobile mini-bar when onMenuToggle is provided', () => {
    vi.mocked(useChat).mockReturnValue({ messages: [], conversation: undefined, isLoading: false, send: vi.fn() });
    wrap(createElement(ChatView, {
      conversationId: 'c1', title: 'My Chat', onMenuToggle: vi.fn(), onNewChat: vi.fn(),
    }));
    expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
    expect(screen.getByText('My Chat')).toBeInTheDocument();
  });
});
