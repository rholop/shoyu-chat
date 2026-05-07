import React, { useState, useEffect, useRef } from 'react';
import { Check, Square, Trash2, Link as LinkIcon, Clock, Calendar } from 'lucide-react';
import { Todo, TodoPriority } from '../../types';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';
import { getSingleTodoExportUrl } from '../../api/todos';

interface TodoItemProps {
  todo: Todo;
  onUpdate: (updates: Partial<Pick<Todo, 'status' | 'priority' | 'dueDate' | 'snoozedUntil' | 'text'>>) => void;
  onDelete: () => void;
}

const priorityColors: Record<TodoPriority, string> = {
  now: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800',
  soon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  someday: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const nextPriority: Record<TodoPriority, TodoPriority> = {
  now: 'soon',
  soon: 'someday',
  someday: 'now',
};

export default function TodoItem({ todo, onUpdate, onDelete }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleToggle = () => {
    onUpdate({ status: todo.status === 'done' ? 'open' : 'done' });
  };

  const handlePriorityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate({ priority: nextPriority[todo.priority] });
  };

  const handleSnooze = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Default snooze: 1 day
    const until = new Date();
    until.setDate(until.getDate() + 1);
    onUpdate({ status: 'snoozed', snoozedUntil: until.toISOString() });
  };

  const handleExport = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = getSingleTodoExportUrl(
      todo.conversationId.replace(/^conversation-/, ''),
      todo.id
    );
  };

  const handleEditSubmit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) {
      onUpdate({ text: trimmed });
    } else {
      setEditText(todo.text);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      setEditText(todo.text);
      setIsEditing(false);
    }
  };

  const formatDate = (iso: string) => {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
  };

  const isDone = todo.status === 'done';
  const isSnoozed = todo.status === 'snoozed';

  return (
    <div className={clsx(
      "group flex items-start gap-3 p-3 rounded-xl border border-transparent hover:border-[#ccc5af] dark:hover:border-slate-800 hover:bg-[#f5f0e1] dark:hover:bg-slate-900/50 transition-all",
      isDone && "opacity-60"
    )}>
      <button
        onClick={handleToggle}
        className="mt-0.5 shrink-0 text-[#586e75] dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        {isDone ? <Check size={18} className="text-indigo-600" /> : <Square size={18} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {isEditing ? (
            <input
              ref={inputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-white dark:bg-slate-800 border border-indigo-500 rounded px-1 text-sm text-[#073642] dark:text-white focus:outline-none"
            />
          ) : (
            <span
              onClick={() => !isDone && setIsEditing(true)}
              className={clsx(
                "text-sm font-medium text-[#073642] dark:text-white cursor-text",
                isDone && "line-through"
              )}
            >
              {todo.text}
            </span>
          )}

          <button
            onClick={handlePriorityClick}
            className={clsx(
              "shrink-0 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border transition-colors",
              priorityColors[todo.priority]
            )}
          >
            {todo.priority}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {todo.projectName && (
            <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">
              {todo.projectName}
            </span>
          )}
          <span className="text-xs text-[#93a1a1] dark:text-slate-500 truncate max-w-[200px]">
            {todo.sourceMessageHint}
          </span>
          <span className="text-[11px] text-[#93a1a1] dark:text-slate-500">
            {formatDate(todo.createdAt)}
          </span>
          {isSnoozed && todo.snoozedUntil && (
            <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
              <Clock size={10} />
              Snoozed until {formatDate(todo.snoozedUntil)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          to={`/chat/${todo.conversationId.replace('conversation-', '')}`}
          className="p-1.5 rounded-lg hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-[#93a1a1] dark:text-slate-500 hover:text-[#073642] dark:hover:text-white transition-colors"
          title="Go to conversation"
        >
          <LinkIcon size={14} />
        </Link>
        <button
          onClick={handleExport}
          className="p-1.5 rounded-lg hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-[#93a1a1] dark:text-slate-500 hover:text-[#073642] dark:hover:text-white transition-colors"
          title="Export to Calendar"
        >
          <Calendar size={14} />
        </button>
        {!isDone && !isSnoozed && (
          <button
            onClick={handleSnooze}
            className="p-1.5 rounded-lg hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-[#93a1a1] dark:text-slate-500 hover:text-[#073642] dark:hover:text-white transition-colors"
            title="Snooze for 1 day"
          >
            <Clock size={14} />
          </button>
        )}
        <button
          onClick={() => { if (window.confirm("Delete this to-do?")) onDelete(); }}
          className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-[#93a1a1] dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
          title="Delete to-do"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
