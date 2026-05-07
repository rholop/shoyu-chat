import React, { useState, useMemo } from 'react';
import { useLoops, useSnoozeLoop, useResolveLoop, useCreateTodoFromLoop } from '../../hooks/useLoops';
import LoopItem from './LoopItem';
import { Filter, Inbox } from 'lucide-react';
import { Intent } from '../../types';

export default function LoopsPanel() {
  const [filters, setFilters] = useState<{ projectId?: string; intent?: string; age?: number }>({});

  const { data, isLoading, isError } = useLoops(filters);
  const snoozeMutation = useSnoozeLoop();
  const resolveMutation = useResolveLoop();
  const todoMutation = useCreateTodoFromLoop();

  const loops = data?.loops ?? [];

  // Derived options for filters
  const availableIntents = useMemo(() => {
    if (!data?.loops) return [];
    const intents = new Set<string>();
    data.loops.forEach(l => {
      if (l.intent) intents.add(l.intent);
    });
    return Array.from(intents).sort();
  }, [data?.loops]);

  const availableProjects = useMemo(() => {
    if (!data?.loops) return [];
    const projectMap = new Map<string, string>();
    data.loops.forEach(l => {
      if (l.projectId && l.projectName) {
        projectMap.set(l.projectId, l.projectName);
      }
    });
    return Array.from(projectMap.entries()).map(([id, name]) => ({ id, name }));
  }, [data?.loops]);

  const sortedLoops = useMemo(() => {
    return [...loops].sort((a, b) => b.daysSinceCreated - a.daysSinceCreated);
  }, [loops]);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 overflow-y-auto bg-[#fdf6e3] dark:bg-slate-950">
        <div className="max-w-4xl mx-auto animate-pulse">
          <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded mb-8" />
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl mb-4" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center bg-[#fdf6e3] dark:bg-slate-950 text-rose-500">
        <div className="text-center">
          <p className="text-lg font-medium">Failed to load open loops.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fdf6e3] dark:bg-slate-950">
      <div className="p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-[#073642] dark:text-white">Open Loops</h1>
                <p className="text-sm text-[#93a1a1] dark:text-slate-500 mt-1">
                  ({data?.total ?? 0} unresolved)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-[#eee8d5] dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-[#586e75] dark:text-slate-400">
                <Filter size={16} />
                <span>Filters:</span>
              </div>

              <select
                value={filters.intent || ''}
                onChange={(e) => setFilters(f => ({ ...f, intent: e.target.value || undefined }))}
                className="bg-transparent text-sm font-medium text-[#073642] dark:text-slate-200 border-none focus:ring-0 cursor-pointer"
              >
                <option value="">All intents</option>
                {availableIntents.map(intent => (
                  <option key={intent} value={intent}>{intent}</option>
                ))}
              </select>

              <select
                value={filters.age || ''}
                onChange={(e) => setFilters(f => ({ ...f, age: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                className="bg-transparent text-sm font-medium text-[#073642] dark:text-slate-200 border-none focus:ring-0 cursor-pointer"
              >
                <option value="">All ages</option>
                <option value="7">Older than 7 days</option>
                <option value="14">Older than 14 days</option>
                <option value="30">Older than 30 days</option>
              </select>

              <select
                value={filters.projectId || ''}
                onChange={(e) => setFilters(f => ({ ...f, projectId: e.target.value || undefined }))}
                className="bg-transparent text-sm font-medium text-[#073642] dark:text-slate-200 border-none focus:ring-0 cursor-pointer"
              >
                <option value="">All projects</option>
                {availableProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </header>

          <div className="space-y-4">
            {sortedLoops.length > 0 ? (
              sortedLoops.map(loop => (
                <LoopItem
                  key={loop.conversationId}
                  loop={loop}
                  onSnooze={(date) => snoozeMutation.mutate({ conversationId: loop.conversationId, snoozedUntil: date })}
                  onResolve={() => resolveMutation.mutate(loop.conversationId)}
                  onCreateTodo={() => todoMutation.mutate(loop.conversationId)}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center text-slate-400 dark:text-slate-600 mb-4">
                  <Inbox size={32} />
                </div>
                <h3 className="text-lg font-medium text-[#073642] dark:text-white mb-2">No open loops</h3>
                <p className="text-sm text-[#93a1a1] dark:text-slate-500 max-w-sm">
                  The system will flag conversations where your goal wasn't clearly met.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
