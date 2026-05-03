import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectDetail from './ProjectDetail';
import { ProjectDetail as ProjectDetailType, ProjectDownloadEntry } from '../../types';

vi.mock('../../hooks/useFileDownload', () => ({
  useFileDownload: () => ({ download: vi.fn() }),
}));

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithQuery(ui: React.ReactElement) {
  const client = makeQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const PROJECT: ProjectDetailType = {
  id: 'p1',
  name: 'My Project',
  description: 'A description',
  created_at: '2026-01-01T00:00:00Z',
  contextDoc: '# Context',
  summary: 'You are building a chat app.',
  conversations: [
    { id: 'c1', title: 'Chat A', projectId: 'p1', created_at: '', updated_at: '2026-01-01T01:00:00Z', model_last_used: null },
    { id: 'c2', title: 'Chat B', projectId: 'p1', created_at: '', updated_at: '2026-01-01T02:00:00Z', model_last_used: null },
  ],
};

const defaultProps = {
  project: PROJECT,
  onBack: vi.fn(),
  onDelete: vi.fn(),
  onSelectConversation: vi.fn(),
  onNewChat: vi.fn(),
  onUpdateName: vi.fn(),
  onUpdateDescription: vi.fn(),
  onUpdateContext: vi.fn(),
};

describe('ProjectDetail', () => {
  it('renders project name', () => {
    render(<ProjectDetail {...defaultProps} />);
    expect(screen.getByText('My Project')).toBeInTheDocument();
  });

  it('renders project description', () => {
    render(<ProjectDetail {...defaultProps} />);
    expect(screen.getByText('A description')).toBeInTheDocument();
  });

  it('renders AI summary', () => {
    render(<ProjectDetail {...defaultProps} />);
    expect(screen.getByText('You are building a chat app.')).toBeInTheDocument();
  });

  it('renders conversations', () => {
    render(<ProjectDetail {...defaultProps} />);
    expect(screen.getByText('Chat A')).toBeInTheDocument();
    expect(screen.getByText('Chat B')).toBeInTheDocument();
  });

  it('shows conversation count', () => {
    render(<ProjectDetail {...defaultProps} />);
    expect(screen.getByText('Conversations (2)')).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<ProjectDetail {...defaultProps} onBack={onBack} />);
    fireEvent.click(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('calls onSelectConversation when conversation clicked', () => {
    const onSelectConversation = vi.fn();
    render(<ProjectDetail {...defaultProps} onSelectConversation={onSelectConversation} />);
    fireEvent.click(screen.getByText('Chat A'));
    expect(onSelectConversation).toHaveBeenCalledWith('c1');
  });

  it('calls onNewChat when New Chat button clicked', () => {
    const onNewChat = vi.fn();
    render(<ProjectDetail {...defaultProps} onNewChat={onNewChat} />);
    fireEvent.click(screen.getByText('New Chat'));
    expect(onNewChat).toHaveBeenCalledWith('p1');
  });

  it('shows confirm dialog before deleting', () => {
    render(<ProjectDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('Delete project'));
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onDelete when confirmed', () => {
    const onDelete = vi.fn();
    render(<ProjectDetail {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText('Delete project'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('cancels delete when Cancel is clicked', () => {
    render(<ProjectDetail {...defaultProps} />);
    fireEvent.click(screen.getByText('Delete project'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();
    expect(screen.getByText('Delete project')).toBeInTheDocument();
  });

  it('does not show summary section when summary is empty', () => {
    render(<ProjectDetail {...defaultProps} project={{ ...PROJECT, summary: '' }} />);
    expect(screen.queryByText('AI Summary')).not.toBeInTheDocument();
  });

  it('shows empty conversations message when no conversations', () => {
    render(<ProjectDetail {...defaultProps} project={{ ...PROJECT, conversations: [] }} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByText('Conversations (0)')).toBeInTheDocument();
  });

  it('calls onUpdateContext when context editor saves', () => {
    const onUpdateContext = vi.fn();
    render(<ProjectDetail {...defaultProps} onUpdateContext={onUpdateContext} />);
    fireEvent.click(screen.getByRole('button', { name: /context/i }));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '# New Context' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdateContext).toHaveBeenCalledWith('# New Context');
  });

  describe('Downloads tab', () => {
    it('shows downloads tab button', () => {
      renderWithQuery(<ProjectDetail {...defaultProps} />);
      expect(screen.getByRole('button', { name: /downloads/i })).toBeInTheDocument();
    });

    it('shows loading skeletons while fetch is in flight', async () => {
      globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
      renderWithQuery(<ProjectDetail {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /downloads/i }));
      await waitFor(() => {
        const pulseEls = document.querySelectorAll('.animate-pulse');
        expect(pulseEls.length).toBeGreaterThan(0);
      });
    });

    it('shows empty state when no downloads returned', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [] as ProjectDownloadEntry[],
      } as Response);
      renderWithQuery(<ProjectDetail {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /downloads/i }));
      await waitFor(() => {
        expect(screen.getByText(/No files generated yet/)).toBeInTheDocument();
      });
    });

    it('renders download entries when data is returned', async () => {
      const entries: ProjectDownloadEntry[] = [
        {
          fileId: 'uuid-1',
          filename: 'output.py',
          description: 'Python script',
          version: 1,
          updated: false,
          size: 512,
          created_at: '2026-01-01T12:00:00Z',
          conversationId: 'c1',
          conversationTitle: 'Chat A',
        },
      ];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => entries,
      } as Response);
      renderWithQuery(<ProjectDetail {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /downloads/i }));
      await waitFor(() => {
        expect(screen.getByText('output.py')).toBeInTheDocument();
        expect(screen.getByText(/Chat A/)).toBeInTheDocument();
      });
    });

    it('builds download URL with correct conversationId and fileId', async () => {
      const entries: ProjectDownloadEntry[] = [
        {
          fileId: 'file-uuid-abc',
          filename: 'report.md',
          version: 1,
          updated: false,
          conversationId: 'conv-xyz',
          conversationTitle: 'My Chat',
        },
      ];
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => entries,
      } as Response);
      renderWithQuery(<ProjectDetail {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: /downloads/i }));
      await waitFor(() => {
        expect(screen.getByText('report.md')).toBeInTheDocument();
      });
      // fetch was called with the correct URL
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/projects/p1/downloads',
        expect.any(Object),
      );
    });
  });
});
