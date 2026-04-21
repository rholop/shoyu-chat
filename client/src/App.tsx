import { useAuth } from './hooks/useAuth';
import LoginScreen from './components/auth/LoginScreen';
import AppShell from './components/layout/AppShell';

export default function App() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return user ? <AppShell /> : <LoginScreen />;
}
