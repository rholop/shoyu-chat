import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TopBar from './TopBar';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../hooks/useAuth';

const defaultAuth = {
  user: null, isLoading: false, login: vi.fn(), loginError: undefined,
  isLoggingIn: false, logout: vi.fn(),
};

const defaultProps = {
  title: 'Shoyu Chat',
  onMenuToggle: vi.fn(),
  onNewChat: vi.fn(),
  onOpenSearch: vi.fn(),
  desktopSidebarOpen: true,
  onDesktopSidebarOpen: vi.fn(),
};

describe('TopBar', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth, logout: vi.fn() });
  });

  it('renders the title', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByText('Shoyu Chat')).toBeInTheDocument();
  });

  it('renders hamburger toggle button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /toggle sidebar/i })).toBeInTheDocument();
  });

  it('calls onMenuToggle when hamburger is clicked', async () => {
    const onMenuToggle = vi.fn();
    render(<TopBar {...defaultProps} onMenuToggle={onMenuToggle} />);
    await userEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
    expect(onMenuToggle).toHaveBeenCalled();
  });

  it('renders new chat button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /new chat/i })).toBeInTheDocument();
  });

  it('calls onNewChat when new chat button is clicked', async () => {
    const onNewChat = vi.fn();
    render(<TopBar {...defaultProps} onNewChat={onNewChat} />);
    await userEvent.click(screen.getByRole('button', { name: /new chat/i }));
    expect(onNewChat).toHaveBeenCalled();
  });

  it('renders sign out button', () => {
    render(<TopBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls logout when sign out is clicked', async () => {
    const logout = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth, logout });
    render(<TopBar {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it('shows open-sidebar button when desktopSidebarOpen is false', () => {
    render(<TopBar {...defaultProps} desktopSidebarOpen={false} />);
    expect(screen.getByRole('button', { name: /open sidebar/i })).toBeInTheDocument();
  });

  it('does not show open-sidebar button when desktopSidebarOpen is true', () => {
    render(<TopBar {...defaultProps} desktopSidebarOpen={true} />);
    expect(screen.queryByRole('button', { name: /open sidebar/i })).not.toBeInTheDocument();
  });
});
