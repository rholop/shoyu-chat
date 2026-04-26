import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageBubble from './MessageBubble';
import { Message } from '../../types';

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
      expect(screen.getByText('Groq')).toBeInTheDocument();
    });

    it('does not render model badge when model_used is null', () => {
      render(<MessageBubble message={makeMessage({ role: 'assistant', content: 'Hi', model_used: null })} />);
      expect(screen.queryByText('Groq')).not.toBeInTheDocument();
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
});
