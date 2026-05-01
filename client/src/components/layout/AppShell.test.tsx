import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppShell from './AppShell';

vi.mock('../../hooks/useConversations', () => ({
  useConversations: vi.fn(),
}));

vi.mock('../../store/chatStore', () => ({
  useChatStore: vi.fn(),
}));

vi.mock('./Sidebar', () => ({
  default: ({ onNewChat, onSelect, onDelete }: {
    onNewChat: () => void; onSelect: (id: string) => void; onDelete: (id: string) => void;
  }) => (
    <div>
      <button onClick={onNewChat}>New Chat</button>
      <button onClick={() => onSelect('conv-1')}>Select Conv 1</button>
      <button onClick={() => onDelete('conv-1')}>Delete Conv 1</button>
    </div>
  ),
}));

vi.mock('./TopBar', () => ({
  default: ({ title, onNewChat }: { title: string; onNewChat: () => void }) => (
    <div>
      <span>{title}</span>
      <button onClick={onNewChat}>TopBar New Chat</button>
    </div>
  ),
}));

vi.mock('../chat/ChatView', () => ({
  default: ({ conversationId }: { conversationId: string }) => (
    <div>ChatView:{conversationId}</div>
  ),
}));

import { useConversations } from '../../hooks/useConversations';
import { useChatStore } from '../../store/chatStore';

const conversations = [
  { id: 'conv-1', title: 'First Chat', created_at: '', updated_at: '', model_last_used: null },
];

describe('AppShell', () => {
  const setActiveConversation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useChatStore).mockReturnValue({
      activeConversationId: null,
      setActiveConversation,
    } as ReturnType<typeof useChatStore>);
  });

  it('renders welcome message when no active conversation', () => {
    vi.mocked(useConversations).mockReturnValue({
      conversations: [],
      isLoading: false,
      create: vi.fn().mockResolvedValue({ id: 'new' }),
      remove: vi.fn(),
      rename: vi.fn(),
      refresh: vi.fn(),
    } as ReturnType<typeof useConversations>);

    render(<AppShell />);
    expect(screen.getByText(/welcome to shoyu chat/i)).toBeInTheDocument();
  });

  it('renders ChatView when a conversation is active', () => {
    vi.mocked(useChatStore).mockReturnValue({
      activeConversationId: 'conv-1',
      setActiveConversation,
    } as ReturnType<typeof useChatStore>);

    vi.mocked(useConversations).mockReturnValue({
      conversations,
      isLoading: false,
      create: vi.fn().mockResolvedValue({ id: 'new' }),
      remove: vi.fn(),
      rename: vi.fn(),
      refresh: vi.fn(),
    } as ReturnType<typeof useConversations>);

    render(<AppShell />);
    expect(screen.getByText('ChatView:conv-1')).toBeInTheDocument();
  });

  it('calls create and setActiveConversation when New Chat is clicked', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'new-conv' });
    vi.mocked(useConversations).mockReturnValue({
      conversations: [],
      isLoading: false,
      create,
      remove: vi.fn(),
      rename: vi.fn(),
      refresh: vi.fn(),
    } as ReturnType<typeof useConversations>);

    render(<AppShell />);
    await userEvent.click(screen.getAllByRole('button', { name: 'New Chat' })[0]);

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(setActiveConversation).toHaveBeenCalledWith('new-conv');
  });

  it('auto-selects first conversation when none is active', () => {
    vi.mocked(useConversations).mockReturnValue({
      conversations,
      isLoading: false,
      create: vi.fn(),
      remove: vi.fn(),
      rename: vi.fn(),
      refresh: vi.fn(),
    } as ReturnType<typeof useConversations>);

    render(<AppShell />);
    expect(setActiveConversation).toHaveBeenCalledWith('conv-1');
  });
});
