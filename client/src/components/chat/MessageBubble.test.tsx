import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageBubble from './MessageBubble';
import { Message, MessageDownload } from '../../types';

vi.mock('../../hooks/useFileDownload', () => ({
  useFileDownload: () => ({ download: vi.fn() }),
}));

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 1,
    conversation_id: 'conv-1',
    role: 'user',
    content: 'Hello world',
    model_used: null,
    created_at: '2026-04-26T14:30:00.000Z',
    ...overrides,
  };
}

describe('MessageBubble', () => {
  describe('user messages', () => {
    it('renders the message content', () => {
      render(<MessageBubble message={makeMessage({ content: 'Hey there!' })} />);
      expect(screen.getByText('Hey there!')).toBeInTheDocument();
    });

    it('does not show AI avatar for user messages', () => {
      render(<MessageBubble message={makeMessage({ role: 'user' })} />);
      expect(screen.queryByText('AI')).not.toBeInTheDocument();
    });

    it('does not show model badge for user messages', () => {
      render(<MessageBubble message={makeMessage({ role: 'user', model_used: 'groq-chat' })} />);
      expect(screen.queryByText('Groq')).not.toBeInTheDocument();
    });

    it('shows formatted timestamp', () => {
      render(<MessageBubble message={makeMessage({ created_at: '2026-04-26T14:30:00.000Z' })} />);
      // Time format depends on locale, just check some time-like text is present
      const timeEl = screen.getByText(/\d{1,2}:\d{2}/);
      expect(timeEl).toBeInTheDocument();
    });
  });

  describe('assistant messages', () => {
    it('renders the AI avatar', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', content: 'Hi!' })} />);
      expect(screen.getByText('AI')).toBeInTheDocument();
    });

    it('renders markdown content', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', content: '**bold text**' })} />);
      expect(screen.getByText('bold text')).toBeInTheDocument();
    });

    it('renders model badge when model_used is set', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', content: 'Hi', model_used: 'groq-chat' })} />);
      expect(screen.getByText('Llama 3.3 70B')).toBeInTheDocument();
    });

    it('does not render model badge when model_used is null', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', content: 'Hi', model_used: null })} />);
      expect(screen.queryByText('Llama 3.3 70B')).not.toBeInTheDocument();
    });

    it('renders links with target blank', () => {
      const { container } = render(
        <MessageBubble message={makeMessage({ role: 'assistant', content: '[link](https://example.com)' })} />
      );
      const link = container.querySelector('a');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders code blocks in pre elements', () => {
      const { container } = render(
        <MessageBubble message={makeMessage({ role: 'assistant', content: '```\ncode here\n```' })} />
      );
      expect(container.querySelector('pre')).toBeInTheDocument();
    });
  });

  describe('download chips', () => {
    const downloads: MessageDownload[] = [
      { fileId: 'uuid-1', filename: 'report.md', description: 'A report', version: 1, updated: false, size: 1024 },
      { fileId: 'uuid-2', filename: 'script.py', description: 'A script', version: 2, updated: true, size: 2048 },
    ];

    it('renders download chips for assistant messages with downloads', () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', downloads })}
          conversationId="conv-1"
        />
      );
      expect(screen.getByText('report.md')).toBeInTheDocument();
      expect(screen.getByText('script.py')).toBeInTheDocument();
    });

    it('does not render download chips when downloads is absent', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant' })} conversationId="conv-1" />);
      expect(screen.queryByText('report.md')).not.toBeInTheDocument();
    });

    it('does not render download chips when downloads is empty', () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', downloads: [] })}
          conversationId="conv-1"
        />
      );
      expect(screen.queryByRole('button', { name: /report/ })).not.toBeInTheDocument();
    });

    it('does not render download chips for user messages even if downloads present', () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'user', downloads })}
          conversationId="conv-1"
        />
      );
      expect(screen.queryByText('report.md')).not.toBeInTheDocument();
    });

    it('shows updated badge for updated downloads', () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', downloads })}
          conversationId="conv-1"
        />
      );
      expect(screen.getByText('v2 updated')).toBeInTheDocument();
    });

    it('shows file description when present', () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', downloads })}
          conversationId="conv-1"
        />
      );
      expect(screen.getByText('A report')).toBeInTheDocument();
    });

    it('chip buttons are clickable without error', () => {
      const { getAllByRole } = render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', downloads: [downloads[0]] })}
          conversationId="conv-1"
        />
      );
      const buttons = getAllByRole('button');
      const chipButton = buttons.find((b) => b.textContent?.includes('report.md'));
      expect(chipButton).toBeDefined();
      expect(() => fireEvent.click(chipButton!)).not.toThrow();
    });

    it('does not show download chips when conversationId is absent', () => {
      render(
        <MessageBubble
          message={makeMessage({ role: 'assistant', downloads })}
        />
      );
      expect(screen.queryByText('report.md')).not.toBeInTheDocument();
    });
  });
});
