import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NudgeBanner } from './NudgeBanner';
import { useChatStore } from '../../store/chatStore';
import { SimilarMatch } from '../../types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

const sampleNudge: SimilarMatch = {
  conversationId: 'c1',
  title: 'Similar Conversation',
  goal: 'Investigate the thing',
  date: '2026-01-01',
  resolved: false,
  score: 0.8,
  topics: ['topic1'],
};

describe('NudgeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ nudges: [] });
  });

  it('renders nothing when there are no nudges', () => {
    const { container } = render(<NudgeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the banner when nudges are present', () => {
    useChatStore.setState({ nudges: [sampleNudge] });
    render(<NudgeBanner />);
    expect(screen.getByText('Similar Conversation')).toBeInTheDocument();
    expect(screen.getByText(/investigate the thing/i)).toBeInTheDocument();
  });

  it('renders the lightbulb label', () => {
    useChatStore.setState({ nudges: [sampleNudge] });
    render(<NudgeBanner />);
    expect(screen.getByText(/you explored something similar/i)).toBeInTheDocument();
  });

  it('shows "Unresolved" badge when resolved === false', () => {
    useChatStore.setState({ nudges: [{ ...sampleNudge, resolved: false }] });
    render(<NudgeBanner />);
    expect(screen.getByText(/unresolved/i)).toBeInTheDocument();
  });

  it('does not show "Unresolved" badge when resolved === true', () => {
    useChatStore.setState({ nudges: [{ ...sampleNudge, resolved: true }] });
    render(<NudgeBanner />);
    expect(screen.queryByText(/unresolved/i)).not.toBeInTheDocument();
  });

  it('does not show "Unresolved" badge when resolved === null', () => {
    useChatStore.setState({ nudges: [{ ...sampleNudge, resolved: null }] });
    render(<NudgeBanner />);
    expect(screen.queryByText(/unresolved/i)).not.toBeInTheDocument();
  });

  it('renders multiple nudge items', () => {
    const nudge2: SimilarMatch = { ...sampleNudge, conversationId: 'c2', title: 'Another Convo' };
    useChatStore.setState({ nudges: [sampleNudge, nudge2] });
    render(<NudgeBanner />);
    expect(screen.getByText('Similar Conversation')).toBeInTheDocument();
    expect(screen.getByText('Another Convo')).toBeInTheDocument();
  });

  it('navigates and clears nudges when "Open conversation" is clicked', async () => {
    useChatStore.setState({ nudges: [sampleNudge] });
    render(<NudgeBanner />);
    await userEvent.click(screen.getByRole('button', { name: /open conversation/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/chat/c1');
    expect(useChatStore.getState().nudges).toHaveLength(0);
  });

  it('clears nudges when Dismiss is clicked', async () => {
    useChatStore.setState({ nudges: [sampleNudge] });
    render(<NudgeBanner />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(useChatStore.getState().nudges).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('auto-dismisses after 30 seconds', () => {
    vi.useFakeTimers();
    useChatStore.setState({ nudges: [sampleNudge] });
    render(<NudgeBanner />);
    expect(useChatStore.getState().nudges).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(useChatStore.getState().nudges).toHaveLength(0);
    vi.useRealTimers();
  });

  it('does not auto-dismiss before 30 seconds', () => {
    vi.useFakeTimers();
    useChatStore.setState({ nudges: [sampleNudge] });
    render(<NudgeBanner />);
    act(() => { vi.advanceTimersByTime(29999); });
    expect(useChatStore.getState().nudges).toHaveLength(1);
    vi.useRealTimers();
  });

  it('resets the auto-dismiss timer when nudges change', () => {
    vi.useFakeTimers();
    const nudge2: SimilarMatch = { ...sampleNudge, conversationId: 'c2', title: 'New nudge' };
    useChatStore.setState({ nudges: [sampleNudge] });
    const { rerender } = render(<NudgeBanner />);

    act(() => { vi.advanceTimersByTime(20000); });
    useChatStore.setState({ nudges: [nudge2] });
    rerender(<NudgeBanner />);

    // Another 20s — 40s total from first nudge, but only 20s from update
    act(() => { vi.advanceTimersByTime(20000); });
    expect(useChatStore.getState().nudges).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(10000); });
    expect(useChatStore.getState().nudges).toHaveLength(0);
    vi.useRealTimers();
  });

  it('formats the date in the nudge', () => {
    useChatStore.setState({ nudges: [{ ...sampleNudge, date: '2026-03-15' }] });
    render(<NudgeBanner />);
    // toLocaleDateString with month: 'short', day: 'numeric'
    expect(screen.getByText(/mar/i)).toBeInTheDocument();
  });
});
