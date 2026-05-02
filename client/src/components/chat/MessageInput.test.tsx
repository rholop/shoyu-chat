import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Intent } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageInput from './MessageInput';

describe('MessageInput', () => {
  beforeEach(() => {
    useChatStore.setState({ selectedIntent: Intent.CODING });
  });

  it('renders the textarea and send button', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
  });

  it('renders the attach button', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /attach file/i })).toBeInTheDocument();
  });

  it('shows an intent-based placeholder text', () => {
    render(<MessageInput onSend={vi.fn()} />);
    // Default intent is CODING; placeholder includes the intent description
    expect(screen.getByRole('textbox').getAttribute('placeholder')).toMatch(/code|refactor|drafting|search|debug|translat|summar|image/i);
  });

  it('calls onSend with trimmed content and empty attachments when Enter is pressed', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, '  hello world  {Enter}');
    expect(onSend).toHaveBeenCalledWith('hello world', []);
  });

  it('calls onSend when send button is clicked', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'hello');
    await userEvent.click(screen.getByRole('button', { name: /send message/i }));
    expect(onSend).toHaveBeenCalledWith('hello', []);
  });

  it('clears the input after sending', async () => {
    render(<MessageInput onSend={vi.fn()} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'hello{Enter}');
    expect(textarea).toHaveValue('');
  });

  it('does not call onSend for empty or whitespace-only input with no attachments', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('inserts newline on Shift+Enter instead of sending', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'line1{Shift>}{Enter}{/Shift}line2');
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('line1\nline2');
  });

  it('send button is disabled when input is empty', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
  });

  it('send button becomes enabled when input has text', async () => {
    render(<MessageInput onSend={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), 'hello');
    expect(screen.getByRole('button', { name: /send message/i })).not.toBeDisabled();
  });

  it('disables textarea and attach button when disabled prop is true', () => {
    render(<MessageInput onSend={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /attach file/i })).toBeDisabled();
  });

  it('does not call onSend when disabled even if Enter is pressed', async () => {
    const onSend = vi.fn();
    const { rerender } = render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'hello');
    rerender(<MessageInput onSend={onSend} disabled />);
    await userEvent.type(textarea, '{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows the help text', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByText(/Enter to send/)).toBeInTheDocument();
  });

  it('renders intent task bar buttons for all intents', () => {
    render(<MessageInput onSend={vi.fn()} />);
    // All 7 intents should have buttons in the task bar
    expect(screen.getByRole('button', { name: /web search/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coding/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /debugging/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /translating/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /drafting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /summarizing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /image analysis/i })).toBeInTheDocument();
  });

  it('marks the active intent button as pressed', () => {
    useChatStore.setState({ selectedIntent: Intent.WEB_SEARCH });
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /web search/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /coding/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows attachment chips when attachments are passed', () => {
    const attachments = [{ fileId: 'f1', filename: 'photo.png', mimeType: 'image/png', size: 1024 }];
    render(<MessageInput onSend={vi.fn()} attachments={attachments} />);
    expect(screen.getByText('photo.png')).toBeInTheDocument();
  });
});
