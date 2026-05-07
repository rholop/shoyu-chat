import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TodoPanel from './TodoPanel';
import { useTodos, useUpdateTodo, useDeleteTodo } from '../../hooks/useTodos';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../hooks/useTodos');

const mockTodos = [
  { id: 't1', conversationId: 'c1', text: 'Now Task', priority: 'now', status: 'open', createdAt: '2026-05-01', sourceMessageHint: 'H1' },
  { id: 't2', conversationId: 'c1', text: 'Soon Task', priority: 'soon', status: 'open', createdAt: '2026-05-01', sourceMessageHint: 'H2' },
  { id: 't3', conversationId: 'c1', text: 'Done Task', priority: 'now', status: 'done', createdAt: '2026-05-01', sourceMessageHint: 'H3', updatedAt: '2026-05-02' },
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
});
