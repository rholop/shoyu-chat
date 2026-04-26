import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginScreen from './LoginScreen';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../hooks/useAuth';

const defaultAuth = {
  user: null,
  isLoading: false,
  login: vi.fn(),
  loginError: undefined,
  isLoggingIn: false,
  logout: vi.fn(),
};

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth, login: vi.fn() });
  });

  it('renders the Shoyu Chat heading', () => {
    render(<LoginScreen />);
    expect(screen.getByText('Shoyu Chat')).toBeInTheDocument();
  });

  it('renders username and password fields', () => {
    render(<LoginScreen />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders the sign in button', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('calls login with username and password on form submit', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth, login });

    render(<LoginScreen />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(login).toHaveBeenCalledWith({ username: 'alice', password: 'secret' });
  });

  it('shows error message when loginError is set', () => {
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth, loginError: 'Invalid credentials' });
    render(<LoginScreen />);
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('does not show error message when loginError is undefined', () => {
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth, loginError: undefined });
    render(<LoginScreen />);
    expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument();
  });

  it('shows "Signing in…" and disables button while isLoggingIn', () => {
    vi.mocked(useAuth).mockReturnValue({ ...defaultAuth, isLoggingIn: true });
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  });

  it('button is enabled when not logging in', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('updates username input as user types', async () => {
    render(<LoginScreen />);
    const input = screen.getByLabelText('Username');
    await userEvent.type(input, 'bob');
    expect(input).toHaveValue('bob');
  });

  it('password field is of type password', () => {
    render(<LoginScreen />);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });
});
