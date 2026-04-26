import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageInput from './MessageInput';

describe('MessageInput', () => {
  it('renders the textarea and send button', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows placeholder text', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText('Message…')).toBeInTheDocument();
  });

  it('calls onSend with trimmed content when Enter is pressed', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, '  hello world  {Enter}');
    expect(onSend).toHaveBeenCalledWith('hello world');
  });

  it('calls onSend when send button is clicked', async () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'hello');
    await userEvent.click(screen.getByRole('button'));
    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('clears the input after sending', async () => {
    render(<MessageInput onSend={vi.fn()} />);
    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'hello{Enter}');
    expect(textarea).toHaveValue('');
  });

  it('does not call onSend for empty or whitespace-only input', async () => {
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
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('send button becomes enabled when input has text', async () => {
    render(<MessageInput onSend={vi.fn()} />);
    await userEvent.type(screen.getByRole('textbox'), 'hello');
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('disables textarea and button when disabled prop is true', () => {
    render(<MessageInput onSend={vi.fn()} disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
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
});
