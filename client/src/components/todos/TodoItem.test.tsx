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
});
