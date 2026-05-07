import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoopItem from './LoopItem';
import { BrowserRouter } from 'react-router-dom';
import { OpenLoop } from '../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('LoopItem', () => {
  const mockLoop: OpenLoop = {
    conversationId: 'conv-123',
    title: 'Test Loop',
    goal: 'Test Goal',
    projectId: 'proj-1',
    projectName: 'Test Project',
    intent: 'CODING',
    topics: ['topic1', 'topic2', 'topic3', 'topic4', 'topic5'],
    createdAt: new Date().toISOString(),
    summarizedAt: new Date().toISOString(),
    daysSinceCreated: 5,
    snoozedUntil: null,
  };

  const defaultProps = {
    loop: mockLoop,
    onSnooze: vi.fn(),
    onResolve: vi.fn(),
    onCreateTodo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderItem = (props = defaultProps) => {
    return render(
      <BrowserRouter>
        <LoopItem {...props} />
      </BrowserRouter>
    );
  };

  it('renders title, goal, project name, intent badge', () => {
    renderItem();
    expect(screen.getByText('Test Loop')).toBeInTheDocument();
    expect(screen.getByText('Test Goal')).toBeInTheDocument();
    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
  });

  it('renders N days open label', () => {
    renderItem();
    expect(screen.getByText('5 days open')).toBeInTheDocument();
  });

  it('applies amber styling when daysSinceCreated is 5', () => {
    renderItem();
    const label = screen.getByText('5 days open');
    expect(label).toHaveClass('text-amber-500');
  });

  it('applies red styling when daysSinceCreated is 14', () => {
    renderItem({ ...defaultProps, loop: { ...mockLoop, daysSinceCreated: 14 } });
    const label = screen.getByText('14 days open');
    expect(label).toHaveClass('text-rose-500');
  });

  it('Resolve shows confirm dialog before calling onResolve', () => {
    const onResolve = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderItem({ ...defaultProps, onResolve });

    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onResolve).toHaveBeenCalled();
  });

  it('cancelling resolve confirm does not call onResolve', () => {
    const onResolve = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderItem({ ...defaultProps, onResolve });

    fireEvent.click(screen.getByRole('button', { name: /resolve/i }));
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('To-Do button calls onCreateTodo', () => {
    const onCreateTodo = vi.fn();
    renderItem({ ...defaultProps, onCreateTodo });

    fireEvent.click(screen.getByRole('button', { name: /to-do/i }));
    expect(onCreateTodo).toHaveBeenCalled();
  });

  it('shows Added to To-Dos feedback after onCreateTodo', async () => {
    renderItem();
    fireEvent.click(screen.getByRole('button', { name: /to-do/i }));
    expect(screen.getByText('Added ✓')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Added ✓')).not.toBeInTheDocument();
    }, { timeout: 2500 });
  });

  it('clicking title navigates to conversation', () => {
    renderItem();
    fireEvent.click(screen.getByText('Test Loop'));
    expect(mockNavigate).toHaveBeenCalledWith('/chat/conv-123');
  });
});
