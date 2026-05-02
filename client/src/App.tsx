import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import LoginScreen from './components/auth/LoginScreen';
import AppShell from './components/layout/AppShell';

export default function App() {
  useTheme();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdf6e3] dark:bg-slate-950">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return user ? <AppShell /> : <LoginScreen />;
}
