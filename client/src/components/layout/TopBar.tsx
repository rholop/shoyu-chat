import { Menu, Plus, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  title: string;
  onMenuToggle: () => void;
  onNewChat: () => void;
}

export default function TopBar({ title, onMenuToggle, onNewChat }: Props) {
  const { logout } = useAuth();

  return (
    <header className="flex items-center gap-2 px-3 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        aria-label="Toggle sidebar"
      >
        <Menu size={20} />
      </button>

      <h1 className="flex-1 text-sm font-medium text-white truncate">{title}</h1>

      <button
        onClick={onNewChat}
        className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        aria-label="New chat"
      >
        <Plus size={20} />
      </button>

      <button
        onClick={() => logout()}
        className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        aria-label="Sign out"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
