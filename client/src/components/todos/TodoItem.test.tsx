import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TodoItem from './TodoItem';
import { Todo } from '../../types';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { exportSingleTodoIcs } from '../../api/todos';

vi.mock('../../api/todos', () => ({
  exportSingleTodoIcs: vi.fn().mockResolvedValue(undefined),
}));

const mockTodo: Todo = {
  id: 't1',
  conversationId: 'conversation-c1',
  text: 'Test Todo',
  priority: 'now',
  status: 'open',
  projectId: null,
  projectName: 'Test Project',
  intent: 'CODING',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  dueDate: null,
  snoozedUntil: null,
  sourceMessageHint: 'Source hint',
  calendarStatus: 'pending',
  startTime: null,
  endTime: null,
  location: null,
  url: null,
  notes: null,
  alarms: [],
  recurrence: null,
  allDay: true,
};

describe('TodoItem', () => {
  it('renders todo text, priority badge, and source hint', () => {
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={vi.fn()} onDelete={vi.fn()} />
      </BrowserRouter>
    );
    expect(screen.getByText('Test Todo')).toBeInTheDocument();
    expect(screen.getByText('now')).toBeInTheDocument();
    expect(screen.getByText('Source hint')).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });

  it('checking checkbox calls onUpdate with status: done', () => {
    const onUpdate = vi.fn();
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={onUpdate} onDelete={vi.fn()} />
      </BrowserRouter>
    );
    const checkbox = screen.getByRole('button', { name: '' }); // Square icon button
    fireEvent.click(checkbox);
    expect(onUpdate).toHaveBeenCalledWith({ status: 'done' });
  });

  it('clicking priority badge cycles to next priority', () => {
    const onUpdate = vi.fn();
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={onUpdate} onDelete={vi.fn()} />
      </BrowserRouter>
    );
    const badge = screen.getByText('now');
    fireEvent.click(badge);
    expect(onUpdate).toHaveBeenCalledWith({ priority: 'soon' });
  });

  it('clicking delete shows confirm and calls onDelete on confirmation', () => {
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={vi.fn()} onDelete={onDelete} />
      </BrowserRouter>
    );
    const deleteBtn = screen.getByTitle('Delete to-do');
    fireEvent.click(deleteBtn);
    expect(window.confirm).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });

  it('cancelling delete does not call onDelete', () => {
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={vi.fn()} onDelete={onDelete} />
      </BrowserRouter>
    );
    const deleteBtn = screen.getByTitle('Delete to-do');
    fireEvent.click(deleteBtn);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('done todos render with strikethrough class', () => {
    const doneTodo = { ...mockTodo, status: 'done' as const };
    render(
      <BrowserRouter>
        <TodoItem todo={doneTodo} onUpdate={vi.fn()} onDelete={vi.fn()} />
      </BrowserRouter>
    );
    expect(screen.getByText('Test Todo')).toHaveClass('line-through');
  });

  it('clicking export icon calls exportSingleTodoIcs with the correct ids', () => {
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={vi.fn()} onDelete={vi.fn()} />
      </BrowserRouter>
    );

    const exportBtn = screen.getByTitle('Export to Calendar');
    fireEvent.click(exportBtn);

    expect(exportSingleTodoIcs).toHaveBeenCalledWith('c1', 't1');
  });

  it('renders pending badge when calendarStatus is pending', () => {
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={vi.fn()} onDelete={vi.fn()} />
      </BrowserRouter>
    );
    expect(screen.getByTitle('Not yet in calendar — set a date to publish')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('does not render pending badge when calendarStatus is published', () => {
    const published = { ...mockTodo, calendarStatus: 'published' as const, dueDate: '2026-05-10' };
    render(
      <BrowserRouter>
        <TodoItem todo={published} onUpdate={vi.fn()} onDelete={vi.fn()} />
      </BrowserRouter>
    );
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });

  it('clicking the todo content area calls onOpenEditor', () => {
    const onOpenEditor = vi.fn();
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={vi.fn()} onDelete={vi.fn()} onOpenEditor={onOpenEditor} />
      </BrowserRouter>
    );
    // Click on the main content area (flex-1 div containing text)
    fireEvent.click(screen.getByText('Test Todo'));
    expect(onOpenEditor).toHaveBeenCalledTimes(1);
  });

  it('clicking the checkbox does not call onOpenEditor', () => {
    const onOpenEditor = vi.fn();
    const onUpdate = vi.fn();
    render(
      <BrowserRouter>
        <TodoItem todo={mockTodo} onUpdate={onUpdate} onDelete={vi.fn()} onOpenEditor={onOpenEditor} />
      </BrowserRouter>
    );
    const checkbox = screen.getByRole('button', { name: '' });
    fireEvent.click(checkbox);
    expect(onOpenEditor).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalled();
  });
});
