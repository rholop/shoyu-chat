import React, { useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useNavigate } from 'react-router-dom';

export const NudgeBanner: React.FC = () => {
  const { nudges, clearNudges } = useChatStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (nudges.length > 0) {
      const timer = setTimeout(() => {
        clearNudges();
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [nudges, clearNudges]);

  if (nudges.length === 0) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
        <span role="img" aria-label="lightbulb">💡</span>
        You explored something similar
      </div>
      
      <div className="space-y-2">
        {nudges.map((match) => (
          <div 
            key={match.conversationId}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {match.title}
                </h4>
                {match.resolved === false && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded border border-amber-200 dark:border-amber-800">
                    Unresolved
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <span>{new Date(match.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="truncate italic">{match.goal}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  navigate(`/chat/${match.conversationId}`);
                  clearNudges();
                }}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors px-2 py-1"
              >
                Open conversation
              </button>
              <button
                onClick={clearNudges}
                className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
