import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';
import { Conversation } from '../../types';
import { useTodos } from '../../hooks/useTodos';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../hooks/useTodos');
vi.mock('../../hooks/useProjectSuggestions', () => ({
  useProjectSuggestions: () => ({ data: [], isLoading: false }),
  useCreateProjectFromSuggestion: () => ({ isPending: false, isError: false }),
  useDismissSuggestion: () => ({ isPending: false }),
}));
vi.mock('../chat/ModelBadge', () => ({
  default: ({ model }: { model: string | null }) => model ? <span>{model}</span> : null,
}));

const conv1: Conversation = {
  id: 'conv-1',
  title: 'First Chat',
  created_at: '2026-05-01T10:00:00Z',
  updated_at: '2026-05-01T11:00:00Z',
  model_last_used: 'groq-chat',
};

const conv2: Conversation = {
  id: 'conv-2',
  title: 'Second Chat',
  created_at: '2026-05-02T10:00:00Z',
  updated_at: '2026-05-02T10:00:00Z',
  model_last_used: null,
};

describe('Sidebar', () => {
  beforeEach(() => {
    vi.mocked(useTodos).mockReturnValue({ data: [] } as any);
  });

  const defaultProps = {
    conversations: [] as Conversation[],
    projects: [] as any[],
    activeId: null as string | null,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onNewChat: vi.fn(),
    onSelectProject: vi.fn(),
    onNewChatInProject: vi.fn(),
    onCreateProject: vi.fn(),
  };

  const renderSidebar = (props: any = defaultProps) => {
    return render(
      <BrowserRouter>
        <Sidebar {...props} />
      </BrowserRouter>
    );
  };

  it('renders New Chat button', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('shows empty state when no conversations', () => {
    renderSidebar();
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it('renders conversation titles', () => {
    renderSidebar({ ...defaultProps, conversations: [conv1, conv2] });
    expect(screen.getByText('First Chat')).toBeInTheDocument();
    expect(screen.getByText('Second Chat')).toBeInTheDocument();
  });

  it('calls onSelect when a conversation is clicked', async () => {
    const onSelect = vi.fn();
    renderSidebar({ ...defaultProps, conversations: [conv1], onSelect });
    await userEvent.click(screen.getByText('First Chat'));
    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });

  it('calls onNewChat when New Chat is clicked', async () => {
    const onNewChat = vi.fn();
    renderSidebar({ ...defaultProps, onNewChat });
    await userEvent.click(screen.getByRole('button', { name: /new chat/i }));
    expect(onNewChat).toHaveBeenCalled();
  });

  it('calls onDelete with conversation id when delete button is clicked', async () => {
    const onDelete = vi.fn();
    renderSidebar({ ...defaultProps, conversations: [conv1], onDelete });
    await userEvent.click(screen.getByRole('button', { name: /delete conversation/i }));
    expect(onDelete).toHaveBeenCalledWith('conv-1');
  });

  it('renders close button when onClose is provided', () => {
    renderSidebar({ ...defaultProps, onClose: vi.fn() });
    expect(screen.getByRole('button', { name: /close sidebar/i })).toBeInTheDocument();
  });

  it('does not render close button when onClose is absent', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: /close sidebar/i })).not.toBeInTheDocument();
  });

  describe('To-Dos', () => {
    it('renders To-Dos navigation link', () => {
      renderSidebar();
      expect(screen.getByText('To-Dos')).toBeInTheDocument();
    });

    it('shows badge when there are now-priority open todos', () => {
      vi.mocked(useTodos).mockReturnValue({
        data: [{ status: 'open', priority: 'now' }]
      } as any);
      renderSidebar();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('badge shows "9+" when count >= 10', () => {
      vi.mocked(useTodos).mockReturnValue({
        data: Array(12).fill({ status: 'open', priority: 'now' })
      } as any);
      renderSidebar();
      expect(screen.getByText('9+')).toBeInTheDocument();
    });

    it('does not show badge when count is 0', () => {
      vi.mocked(useTodos).mockReturnValue({
        data: [{ status: 'open', priority: 'soon' }]
      } as any);
      renderSidebar();
      expect(screen.queryByText('1')).not.toBeInTheDocument();
    });
  });

  describe('unresolved indicator', () => {
    it('renders unresolved indicator for conversations where resolved === false', () => {
      const conv: Conversation = { ...conv1, id: 'unresolved-1', resolved: false };
      renderSidebar({ ...defaultProps, conversations: [conv] });
      expect(screen.getByTitle('Unresolved')).toBeInTheDocument();
    });

    it('does not render indicator for resolved === true', () => {
      const conv: Conversation = { ...conv1, id: 'resolved-1', resolved: true };
      renderSidebar({ ...defaultProps, conversations: [conv] });
      expect(screen.queryByTitle('Unresolved')).not.toBeInTheDocument();
    });

    it('does not render indicator for resolved === null', () => {
      const conv: Conversation = { ...conv1, id: 'null-1', resolved: null };
      renderSidebar({ ...defaultProps, conversations: [conv] });
      expect(screen.queryByTitle('Unresolved')).not.toBeInTheDocument();
    });
  });
});
