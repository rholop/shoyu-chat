import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProjectList from './ProjectList';
import { Project, Conversation } from '../../types';

const PROJECTS: Project[] = [
  { id: 'p1', name: 'My Project', description: 'A project', created_at: '2026-01-01T00:00:00Z', conversationCount: 2 },
  { id: 'p2', name: 'Other Project', description: '', created_at: '2026-01-02T00:00:00Z', conversationCount: 0 },
];

const CONVERSATIONS: Conversation[] = [
  { id: 'c1', title: 'Chat A', projectId: 'p1', created_at: '', updated_at: '2026-01-01T01:00:00Z', model_last_used: null },
  { id: 'c2', title: 'Chat B', projectId: 'p1', created_at: '', updated_at: '2026-01-01T02:00:00Z', model_last_used: null },
  { id: 'c3', title: 'Chat C', projectId: 'p2', created_at: '', updated_at: '2026-01-01T03:00:00Z', model_last_used: null },
];

const defaultProps = {
  projects: PROJECTS,
  conversations: CONVERSATIONS,
  activeConversationId: null,
  onSelectProject: vi.fn(),
  onSelectConversation: vi.fn(),
  onNewChatInProject: vi.fn(),
  onDeleteConversation: vi.fn(),
  onCreateProject: vi.fn(),
};

describe('ProjectList', () => {
  it('renders nothing when projects is empty', () => {
    const { container } = render(<ProjectList {...defaultProps} projects={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders project names', () => {
    render(<ProjectList {...defaultProps} />);
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('Other Project')).toBeInTheDocument();
  });

  it('renders conversations under their project by default', () => {
    render(<ProjectList {...defaultProps} />);
    expect(screen.getByText('Chat A')).toBeInTheDocument();
    expect(screen.getByText('Chat B')).toBeInTheDocument();
    expect(screen.getByText('Chat C')).toBeInTheDocument();
  });

  it('calls onSelectProject when project name is clicked', () => {
    const onSelectProject = vi.fn();
    render(<ProjectList {...defaultProps} onSelectProject={onSelectProject} />);
    fireEvent.click(screen.getByText('My Project'));
    expect(onSelectProject).toHaveBeenCalledWith('p1');
  });

  it('calls onSelectConversation when conversation is clicked', () => {
    const onSelectConversation = vi.fn();
    render(<ProjectList {...defaultProps} onSelectConversation={onSelectConversation} />);
    fireEvent.click(screen.getByText('Chat A'));
    expect(onSelectConversation).toHaveBeenCalledWith('c1');
  });

  it('collapses project conversations when chevron is clicked', () => {
    render(<ProjectList {...defaultProps} />);
    const collapseButtons = screen.getAllByLabelText('Collapse');
    fireEvent.click(collapseButtons[0]);
    expect(screen.queryByText('Chat A')).not.toBeInTheDocument();
    expect(screen.queryByText('Chat B')).not.toBeInTheDocument();
  });

  it('expands collapsed project when chevron is clicked again', () => {
    render(<ProjectList {...defaultProps} />);
    const collapseButtons = screen.getAllByLabelText('Collapse');
    fireEvent.click(collapseButtons[0]);
    fireEvent.click(screen.getAllByLabelText('Expand')[0]);
    expect(screen.getByText('Chat A')).toBeInTheDocument();
  });

  it('accepts onCreateProject prop without throwing', () => {
    const onCreateProject = vi.fn();
    expect(() => render(<ProjectList {...defaultProps} onCreateProject={onCreateProject} />)).not.toThrow();
  });

  it('highlights active conversation', () => {
    render(<ProjectList {...defaultProps} activeConversationId="c1" />);
    const chatA = screen.getByText('Chat A').closest('div');
    expect(chatA?.className).toContain('bg-slate-700');
  });

  it('shows empty state for projects with no conversations', () => {
    render(<ProjectList {...defaultProps} conversations={[]} />);
    const emptyMessages = screen.getAllByText('No conversations yet');
    expect(emptyMessages).toHaveLength(2);
  });
});
