import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import LoginScreen from './components/auth/LoginScreen';
import AppShell from './components/layout/AppShell';
import TodoPanel from './components/todos/TodoPanel';
import ChatViewWrapper from './components/chat/ChatViewWrapper';
import ProjectDetailWrapper from './components/projects/ProjectDetailWrapper';

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

  return user ? (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat" element={<ChatViewWrapper />} />
        <Route path="chat/:id" element={<ChatViewWrapper />} />
        <Route path="projects/:id" element={<ProjectDetailWrapper />} />
        <Route path="todos" element={<TodoPanel />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  ) : (
    <LoginScreen />
  );
}
