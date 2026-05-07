import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectSuggestionBanner } from './ProjectSuggestionBanner';
import * as hooks from '../../hooks/useProjectSuggestions';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../hooks/useProjectSuggestions');

const renderBanner = () => {
  return render(
    <BrowserRouter>
      <ProjectSuggestionBanner />
    </BrowserRouter>
  );
};

describe('ProjectSuggestionBanner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders nothing when suggestions array is empty', () => {
    vi.mocked(hooks.useProjectSuggestions).mockReturnValue({ data: [], isLoading: false } as any);
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while loading', () => {
    vi.mocked(hooks.useProjectSuggestions).mockReturnValue({ data: undefined, isLoading: true } as any);
    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it('renders topic name, conversation count, week count, and goals', () => {
    const mockSuggestion = {
      topic: 'Auth',
      conversationCount: 7,
      weekCount: 3,
      firstSeen: '2024-04-01',
      lastSeen: '2024-05-01',
      relatedGoals: ['Goal 1', 'Goal 2'],
    };
    vi.mocked(hooks.useProjectSuggestions).mockReturnValue({ data: [mockSuggestion], isLoading: false } as any);
    vi.mocked(hooks.useCreateProjectFromSuggestion).mockReturnValue({ isPending: false, isError: false } as any);
    vi.mocked(hooks.useDismissSuggestion).mockReturnValue({ isPending: false } as any);

    renderBanner();

    expect(screen.getByText(/You've explored "Auth" 7 times without a project/)).toBeDefined();
    expect(screen.getByText(/3 weeks/)).toBeDefined();
    expect(screen.getByText('Goal 1')).toBeDefined();
    expect(screen.getByText('Goal 2')).toBeDefined();
  });

  it('"Create Project" button shows loading state while mutation is pending', () => {
    const mockSuggestion = { topic: 'Auth', conversationCount: 7, weekCount: 3, firstSeen: '2024-04-01', lastSeen: '2024-05-01', relatedGoals: [] };
    vi.mocked(hooks.useProjectSuggestions).mockReturnValue({ data: [mockSuggestion], isLoading: false } as any);
    vi.mocked(hooks.useCreateProjectFromSuggestion).mockReturnValue({ isPending: true, isError: false } as any);
    vi.mocked(hooks.useDismissSuggestion).mockReturnValue({ isPending: false } as any);

    renderBanner();
    expect(screen.getByText('Creating...')).toBeDefined();
  });

  it('"Not now" button calls dismiss mutation', () => {
    const mockSuggestion = { topic: 'Auth', conversationCount: 7, weekCount: 3, firstSeen: '2024-04-01', lastSeen: '2024-05-01', relatedGoals: [] };
    const mockDismiss = vi.fn();
    vi.mocked(hooks.useProjectSuggestions).mockReturnValue({ data: [mockSuggestion], isLoading: false } as any);
    vi.mocked(hooks.useCreateProjectFromSuggestion).mockReturnValue({ isPending: false, isError: false } as any);
    vi.mocked(hooks.useDismissSuggestion).mockReturnValue({ mutate: mockDismiss, isPending: false } as any);

    renderBanner();
    fireEvent.click(screen.getByText('Not now'));
    expect(mockDismiss).toHaveBeenCalledWith('Auth');
  });

  it('Error state renders inline message on create failure', () => {
    const mockSuggestion = { topic: 'Auth', conversationCount: 7, weekCount: 3, firstSeen: '2024-04-01', lastSeen: '2024-05-01', relatedGoals: [] };
    vi.mocked(hooks.useProjectSuggestions).mockReturnValue({ data: [mockSuggestion], isLoading: false } as any);
    vi.mocked(hooks.useCreateProjectFromSuggestion).mockReturnValue({ isPending: false, isError: true } as any);
    vi.mocked(hooks.useDismissSuggestion).mockReturnValue({ isPending: false } as any);

    renderBanner();
    expect(screen.getByText('Failed to create project. Try again.')).toBeDefined();
  });
});
