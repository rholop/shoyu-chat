import { Menu, Plus, LogOut, PanelLeftOpen } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface Props {
  title: string;
  onMenuToggle: () => void;
  onNewChat: () => void;
  desktopSidebarOpen: boolean;
  onDesktopSidebarOpen: () => void;
}

export default function TopBar({ title, onMenuToggle, onNewChat, desktopSidebarOpen, onDesktopSidebarOpen }: Props) {
  const { logout } = useAuth();

  return (
    <header className="flex items-center gap-2 px-3 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
      {/* Mobile: hamburger to open slide-over sidebar */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors md:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu size={20} />
      </button>
      {/* Desktop: show open-sidebar button only when sidebar is collapsed */}
      {!desktopSidebarOpen && (
        <button
          onClick={onDesktopSidebarOpen}
          className="hidden md:flex p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          aria-label="Open sidebar"
        >
          <PanelLeftOpen size={20} />
        </button>
      )}

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
