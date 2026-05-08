import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TodoPanel from './TodoPanel';
import { useTodos, useUpdateTodo, useDeleteTodo } from '../../hooks/useTodos';
import { exportAllTodosIcs } from '../../api/todos';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../hooks/useTodos');
vi.mock('../../api/todos', () => ({
  exportAllTodosIcs: vi.fn().mockResolvedValue(undefined),
  getCalendarToken: vi.fn().mockResolvedValue('test-token'),
}));

const newFields = {
  calendarStatus: 'pending' as const,
  startTime: null, endTime: null, location: null, url: null, notes: null,
  alarms: [], recurrence: null, allDay: true,
};

const mockTodos = [
  { id: 't1', conversationId: 'c1', text: 'Now Task', priority: 'now', status: 'open', createdAt: '2026-05-01', sourceMessageHint: 'H1', ...newFields },
  { id: 't2', conversationId: 'c1', text: 'Soon Task', priority: 'soon', status: 'open', createdAt: '2026-05-01', sourceMessageHint: 'H2', ...newFields },
  { id: 't3', conversationId: 'c1', text: 'Done Task', priority: 'now', status: 'done', createdAt: '2026-05-01', sourceMessageHint: 'H3', updatedAt: '2026-05-02', ...newFields },
];

describe('TodoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUpdateTodo).mockReturnValue({ mutate: vi.fn() } as any);
    vi.mocked(useDeleteTodo).mockReturnValue({ mutate: vi.fn() } as any);
  });

  it('renders loading skeleton while fetching', () => {
    vi.mocked(useTodos).mockReturnValue({ isLoading: true } as any);
    const { container } = render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
  });

  it('renders empty state when no todos', () => {
    vi.mocked(useTodos).mockReturnValue({ data: [], isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    expect(screen.getByText(/No open to-dos/)).toBeInTheDocument();
  });

  it('renders error state when query fails', () => {
    vi.mocked(useTodos).mockReturnValue({ isError: true, isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    expect(screen.getByText(/Failed to load to-dos/)).toBeInTheDocument();
  });

  it('renders todos grouped by priority section', () => {
    vi.mocked(useTodos).mockReturnValue({ data: mockTodos, isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    // Check for section headers (uppercase in TodoPanel, text in TodoItem)
    expect(screen.getByText('Now')).toBeInTheDocument();
    expect(screen.getByText('Now Task')).toBeInTheDocument();
    expect(screen.getByText('Soon')).toBeInTheDocument();
    expect(screen.getByText('Soon Task')).toBeInTheDocument();
    // Done task should be hidden by default
    expect(screen.queryByText('Done Task')).not.toBeInTheDocument();
  });

  it('"Now" filter hides soon todos', () => {
    vi.mocked(useTodos).mockReturnValue({ data: mockTodos, isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    // There are multiple "now" texts, we want the one in the filter row which is a full-width button
    const nowFilters = screen.getAllByRole('button', { name: 'now' });
    fireEvent.click(nowFilters[0]);
    expect(screen.getByText('Now Task')).toBeInTheDocument();
    expect(screen.queryByText('Soon Task')).not.toBeInTheDocument();
  });

  it('"Show completed" toggle reveals done todos', () => {
    vi.mocked(useTodos).mockReturnValue({ data: mockTodos, isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Show completed'));
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Done Task')).toBeInTheDocument();
  });

  it('clicking export button calls exportAllTodosIcs', () => {
    vi.mocked(useTodos).mockReturnValue({ data: mockTodos, isLoading: false } as any);

    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );

    const exportBtn = screen.getByTitle('Export all open to-dos to Calendar');
    fireEvent.click(exportBtn);

    expect(exportAllTodosIcs).toHaveBeenCalled();
  });

  it('export button is disabled when no open todos', () => {
    vi.mocked(useTodos).mockReturnValue({ data: [{ status: 'done', text: 'Done' }], isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );

    const exportBtn = screen.getByTitle('No open to-dos to export');
    expect(exportBtn).toBeDisabled();
  });

  it('does not render TodoDetailEditor when no todo is being edited', () => {
    vi.mocked(useTodos).mockReturnValue({ data: mockTodos, isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders TodoDetailEditor when a todo row is clicked', () => {
    vi.mocked(useTodos).mockReturnValue({ data: mockTodos, isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Now Task'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit To-Do')).toBeInTheDocument();
  });

  it('closes TodoDetailEditor when onClose is called', () => {
    vi.mocked(useTodos).mockReturnValue({ data: mockTodos, isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Now Task'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls updateTodo mutation and closes editor on save', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(useUpdateTodo).mockReturnValue({ mutateAsync, mutate: vi.fn() } as any);
    vi.mocked(useTodos).mockReturnValue({ data: mockTodos, isLoading: false } as any);
    render(
      <BrowserRouter>
        <TodoPanel />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Now Task'));
    // Change title to have something to save
    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'New title' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
