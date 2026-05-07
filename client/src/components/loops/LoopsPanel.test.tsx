import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoopsPanel from './LoopsPanel';
import { BrowserRouter } from 'react-router-dom';
import { useLoops, useSnoozeLoop, useResolveLoop, useCreateTodoFromLoop } from '../../hooks/useLoops';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../hooks/useLoops');

const mockLoops = [
  { conversationId: '1', title: 'Old Loop', daysSinceCreated: 20, intent: 'CODING', topics: [] },
  { conversationId: '2', title: 'New Loop', daysSinceCreated: 2, intent: 'DEBUGGING', topics: [], projectId: 'p1', projectName: 'Proj 1' }
];

describe('LoopsPanel', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useLoops).mockReturnValue({ data: { loops: mockLoops, total: 2 }, isLoading: false, isError: false } as any);
    vi.mocked(useSnoozeLoop).mockReturnValue({ mutate: vi.fn() } as any);
    vi.mocked(useResolveLoop).mockReturnValue({ mutate: vi.fn() } as any);
    vi.mocked(useCreateTodoFromLoop).mockReturnValue({ mutate: vi.fn() } as any);
  });

  const renderPanel = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LoopsPanel />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  it('renders loading skeleton while fetching', () => {
    vi.mocked(useLoops).mockReturnValue({ isLoading: true } as any);
    renderPanel();
    // Look for animation class or multiple skeleton divs
    const pulseDivs = screen.getAllByRole('generic').filter(el => el.className.includes('animate-pulse'));
    expect(pulseDivs.length).toBeGreaterThan(0);
  });

  it('renders empty state when no loops', () => {
    vi.mocked(useLoops).mockReturnValue({ data: { loops: [], total: 0 }, isLoading: false } as any);
    renderPanel();
    expect(screen.getByText(/no open loops/i)).toBeInTheDocument();
  });

  it('renders error state on fetch failure', () => {
    vi.mocked(useLoops).mockReturnValue({ isError: true } as any);
    renderPanel();
    expect(screen.getByText(/failed to load open loops/i)).toBeInTheDocument();
  });

  it('renders list of LoopItem for each loop', () => {
    renderPanel();
    expect(screen.getByText('Old Loop')).toBeInTheDocument();
    expect(screen.getByText('New Loop')).toBeInTheDocument();
  });

  it('loops are sorted oldest first (highest daysSinceCreated)', () => {
    renderPanel();
    const titles = screen.getAllByRole('button').filter(el => el.className.includes('text-lg')).map(el => el.textContent);
    expect(titles[0]).toBe('Old Loop');
    expect(titles[1]).toBe('New Loop');
  });

  it('intent filter changes filter state', () => {
    renderPanel();
    const select = screen.getByDisplayValue('All intents');
    fireEvent.change(select, { target: { value: 'CODING' } });
    expect(useLoops).toHaveBeenLastCalledWith(expect.objectContaining({ intent: 'CODING' }));
  });

  it('age filter changes filter state', () => {
    renderPanel();
    const select = screen.getByDisplayValue('All ages');
    fireEvent.change(select, { target: { value: '7' } });
    expect(useLoops).toHaveBeenLastCalledWith(expect.objectContaining({ age: 7 }));
  });
});
