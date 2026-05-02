import { useState, FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';

export default function LoginScreen() {
  const { login, isLoggingIn, loginError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login({ username, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdf6e3] dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[#073642] dark:text-white mb-2 text-center">Shoyu Chat</h1>
        <p className="text-[#586e75] dark:text-slate-400 text-sm text-center mb-8">Personal AI assistant</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[#073642] dark:text-slate-300 mb-1" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#e0d8c4] dark:bg-slate-800 border border-[#b8b09e] dark:border-slate-700 rounded-lg px-4 py-3 text-[#073642] dark:text-white placeholder-[#93a1a1] dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="admin"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-[#073642] dark:text-slate-300 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#e0d8c4] dark:bg-slate-800 border border-[#b8b09e] dark:border-slate-700 rounded-lg px-4 py-3 text-[#073642] dark:text-white placeholder-[#93a1a1] dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
              required
            />
          </div>

          {loginError && (
            <p className="text-red-600 dark:text-red-400 text-sm">{loginError}</p>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors"
          >
            {isLoggingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
