import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Sidebar from './Sidebar';
import { Conversation } from '../../types';

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
  const defaultProps = {
    conversations: [],
    projects: [],
    activeId: null,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onNewChat: vi.fn(),
    onSelectProject: vi.fn(),
    onNewChatInProject: vi.fn(),
    onCreateProject: vi.fn(),
  };

  it('renders New Chat button', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('shows empty state when no conversations', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it('renders conversation titles', () => {
    render(<Sidebar {...defaultProps} conversations={[conv1, conv2]} />);
    expect(screen.getByText('First Chat')).toBeInTheDocument();
    expect(screen.getByText('Second Chat')).toBeInTheDocument();
  });

  it('calls onSelect when a conversation is clicked', async () => {
    const onSelect = vi.fn();
    render(<Sidebar {...defaultProps} conversations={[conv1]} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('First Chat'));
    expect(onSelect).toHaveBeenCalledWith('conv-1');
  });

  it('calls onNewChat when New Chat is clicked', async () => {
    const onNewChat = vi.fn();
    render(<Sidebar {...defaultProps} onNewChat={onNewChat} />);
    await userEvent.click(screen.getByRole('button', { name: /new chat/i }));
    expect(onNewChat).toHaveBeenCalled();
  });

  it('calls onDelete with conversation id when delete button is clicked', async () => {
    const onDelete = vi.fn();
    render(<Sidebar {...defaultProps} conversations={[conv1]} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /delete conversation/i }));
    expect(onDelete).toHaveBeenCalledWith('conv-1');
  });

  it('renders close button when onClose is provided', () => {
    render(<Sidebar {...defaultProps} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /close sidebar/i })).toBeInTheDocument();
  });

  it('does not render close button when onClose is absent', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /close sidebar/i })).not.toBeInTheDocument();
  });

  describe('unresolved indicator', () => {
    it('renders unresolved indicator for conversations where resolved === false', () => {
      const conv: Conversation = { ...conv1, id: 'unresolved-1', resolved: false };
      render(<Sidebar {...defaultProps} conversations={[conv]} />);
      expect(screen.getByTitle('Unresolved')).toBeInTheDocument();
    });

    it('does not render indicator for resolved === true', () => {
      const conv: Conversation = { ...conv1, id: 'resolved-1', resolved: true };
      render(<Sidebar {...defaultProps} conversations={[conv]} />);
      expect(screen.queryByTitle('Unresolved')).not.toBeInTheDocument();
    });

    it('does not render indicator for resolved === null', () => {
      const conv: Conversation = { ...conv1, id: 'null-1', resolved: null };
      render(<Sidebar {...defaultProps} conversations={[conv]} />);
      expect(screen.queryByTitle('Unresolved')).not.toBeInTheDocument();
    });
  });
});
