import React, { useState } from 'react';
import { useTodos, useUpdateTodo, useDeleteTodo } from '../../hooks/useTodos';
import TodoItem from './TodoItem';
import TodoDetailEditor from './TodoDetailEditor';
import { Todo, TodoPriority, TodoUpdateFields } from '../../types';
import { clsx } from 'clsx';
import { Filter, CheckCircle2, Calendar, RefreshCw, Clock, AlertCircle } from 'lucide-react';
import { exportAllTodosIcs, getCalendarToken } from '../../api/todos';

const STALE_SOON_DAYS = 30;
const STALE_SOMEDAY_DAYS = 60;

// Mirrors the server's staleness rule in todoDigestService.ts: open, no due date, never edited
// since creation, and old for its priority. Surfaced for the user to review — never auto-removed.
function isStale(todo: Todo): boolean {
  if (todo.status !== 'open' || todo.dueDate || todo.updatedAt !== todo.createdAt) return false;
  const ageDays = (Date.now() - new Date(todo.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (todo.priority === 'soon') return ageDays > STALE_SOON_DAYS;
  if (todo.priority === 'someday') return ageDays > STALE_SOMEDAY_DAYS;
  return false;
}

export default function TodoPanel() {
  const { data: todos = [], isLoading, isError } = useTodos();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();
  const [filter, setFilter] = useState<TodoPriority | 'all'>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  async function handleSave(updates: TodoUpdateFields) {
    if (!editingTodo) return;
    await updateTodo.mutateAsync({
      conversationId: editingTodo.conversationId.replace('conversation-', ''),
      todoId: editingTodo.id,
      updates
    });
    setEditingTodo(null);
  }

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-[#e0d8c4] dark:bg-slate-900 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <p className="text-rose-600 dark:text-rose-400 font-medium mb-2">Failed to load to-dos.</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Try refreshing
        </button>
      </div>
    );
  }

  // Snoozed todos are hidden from the active groups until the backend wakes them back up to
  // 'open' on their snoozedUntil date — surfaced separately so snoozing actually hides them.
  const openTodos = todos.filter(t => t.status === 'open');
  const snoozedTodos = todos.filter(t => t.status === 'snoozed');
  const doneTodos = todos.filter(t => t.status === 'done');

  const staleCount = openTodos.filter(isStale).length;

  const filteredOpen = openTodos.filter(t =>
    (filter === 'all' || t.priority === filter) && (!reviewOnly || isStale(t))
  );

  const groups: { label: string; priority: TodoPriority; items: Todo[] }[] = [
    { label: 'Now', priority: 'now', items: filteredOpen.filter(t => t.priority === 'now') },
    { label: 'Soon', priority: 'soon', items: filteredOpen.filter(t => t.priority === 'soon') },
    { label: 'Someday', priority: 'someday', items: filteredOpen.filter(t => t.priority === 'someday') },
  ];

  const hasAnyOpen = openTodos.length > 0;

  const handleExportAll = async () => {
    if (!hasAnyOpen) return;
    await exportAllTodosIcs();
  };

  const handleSubscribeCalendar = async () => {
    setIsSubscribing(true);
    try {
      const token = await getCalendarToken();
      const webcalUrl = `webcal://${window.location.host}/api/calendar/${token}/subscribe.ics`;
      window.location.href = webcalUrl;
    } catch {
      // ignore
    } finally {
      setIsSubscribing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#fdf6e3] dark:bg-slate-950 overflow-hidden">
      {editingTodo && (
        <TodoDetailEditor
          todo={editingTodo}
          onClose={() => setEditingTodo(null)}
          onSave={handleSave}
        />
      )}
      <header className="px-6 py-4 border-b border-[#ccc5af] dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#073642] dark:text-white">To-Dos</h1>
            <span className="text-sm text-[#93a1a1] dark:text-slate-500">({openTodos.length} open)</span>
          </div>
          <div className="flex items-center gap-2">
            {snoozedTodos.length > 0 && (
              <button
                onClick={() => setShowSnoozed(!showSnoozed)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                  showSnoozed
                    ? "bg-indigo-600 text-white"
                    : "bg-[#eee8d5] dark:bg-slate-900 text-[#586e75] dark:text-slate-400 hover:text-[#073642] dark:hover:text-white"
                )}
              >
                <Clock size={14} />
                Snoozed ({snoozedTodos.length})
              </button>
            )}
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                showCompleted
                  ? "bg-indigo-600 text-white"
                  : "bg-[#eee8d5] dark:bg-slate-900 text-[#586e75] dark:text-slate-400 hover:text-[#073642] dark:hover:text-white"
              )}
            >
              <CheckCircle2 size={14} />
              Show completed
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={14} className="text-[#93a1a1] dark:text-slate-500" />
            {(['all', 'now', 'soon', 'someday'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-3 py-1 text-xs font-medium rounded-full border transition-all capitalize",
                  filter === f
                    ? "bg-indigo-600 border-indigo-600 text-white"
                    : "bg-transparent border-[#ccc5af] dark:border-slate-800 text-[#586e75] dark:text-slate-400 hover:border-[#93a1a1] dark:hover:border-slate-600"
                )}
              >
                {f}
              </button>
            ))}
            {staleCount > 0 && (
              <button
                onClick={() => setReviewOnly(!reviewOnly)}
                title="Open to-dos with no due date that haven't been touched in a while"
                className={clsx(
                  "flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full border transition-all",
                  reviewOnly
                    ? "bg-amber-600 border-amber-600 text-white"
                    : "bg-transparent border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-500 hover:border-amber-500"
                )}
              >
                <AlertCircle size={12} />
                Needs review ({staleCount})
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportAll}
              disabled={!hasAnyOpen}
              className={clsx(
                "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors border",
                hasAnyOpen
                  ? "bg-[#eee8d5] dark:bg-slate-900 border-[#ccc5af] dark:border-slate-800 text-[#586e75] dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-600 dark:hover:border-indigo-400"
                  : "bg-transparent border-[#eee8d5] dark:border-slate-900 text-[#93a1a1] dark:text-slate-600 cursor-not-allowed"
              )}
              title={hasAnyOpen ? "Export all open to-dos to Calendar" : "No open to-dos to export"}
            >
              <Calendar size={13} />
              Export
            </button>
            <button
              onClick={handleSubscribeCalendar}
              disabled={isSubscribing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors border bg-[#eee8d5] dark:bg-slate-900 border-[#ccc5af] dark:border-slate-800 text-[#586e75] dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-600 dark:hover:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Subscribe in Apple Calendar (live updates)"
            >
              <RefreshCw size={13} className={isSubscribing ? 'animate-spin' : ''} />
              Subscribe
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
        {!hasAnyOpen && !showCompleted && (
          <div className="py-12 text-center">
            <p className="text-[#586e75] dark:text-slate-400">No open to-dos. They'll appear here after conversations are summarized.</p>
          </div>
        )}

        {groups.map(group => group.items.length > 0 && (
          <section key={group.priority}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#93a1a1] dark:text-slate-500 mb-3 ml-1">
              {group.label}
            </h2>
            <div className="space-y-1">
              {group.items.map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onUpdate={(updates) => updateTodo.mutate({ conversationId: todo.conversationId.replace('conversation-', ''), todoId: todo.id, updates })}
                  onDelete={() => deleteTodo.mutate({ conversationId: todo.conversationId.replace('conversation-', ''), todoId: todo.id })}
                  onOpenEditor={() => setEditingTodo(todo)}
                />
              ))}
            </div>
          </section>
        ))}

        {showSnoozed && snoozedTodos.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#93a1a1] dark:text-slate-500 mb-3 ml-1">
              Snoozed
            </h2>
            <div className="space-y-1">
              {snoozedTodos
                .sort((a, b) => (a.snoozedUntil ?? '').localeCompare(b.snoozedUntil ?? ''))
                .map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onUpdate={(updates) => updateTodo.mutate({ conversationId: todo.conversationId.replace('conversation-', ''), todoId: todo.id, updates })}
                  onDelete={() => deleteTodo.mutate({ conversationId: todo.conversationId.replace('conversation-', ''), todoId: todo.id })}
                  onOpenEditor={() => setEditingTodo(todo)}
                />
              ))}
            </div>
          </section>
        )}

        {showCompleted && doneTodos.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#93a1a1] dark:text-slate-500 mb-3 ml-1">
              Completed
            </h2>
            <div className="space-y-1">
              {doneTodos
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onUpdate={(updates) => updateTodo.mutate({ conversationId: todo.conversationId.replace('conversation-', ''), todoId: todo.id, updates })}
                  onDelete={() => deleteTodo.mutate({ conversationId: todo.conversationId.replace('conversation-', ''), todoId: todo.id })}
                  onOpenEditor={() => setEditingTodo(todo)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
