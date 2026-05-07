import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, CheckCircle, ListPlus, Clock } from 'lucide-react';
import { OpenLoop, INTENT_CONFIG, Intent } from '../../types';

interface LoopItemProps {
  loop: OpenLoop;
  onSnooze: (snoozedUntil: string) => void;
  onResolve: () => void;
  onCreateTodo: () => void;
}

export default function LoopItem({ loop, onSnooze, onResolve, onCreateTodo }: LoopItemProps) {
  const navigate = useNavigate();
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
  const [todoFeedback, setTodoFeedback] = useState(false);

  const handleSnooze = (weeks: number) => {
    const date = new Date();
    date.setDate(date.getDate() + weeks * 7);
    onSnooze(date.toISOString().slice(0, 10));
    setShowSnoozeOptions(false);
  };

  const handleResolve = () => {
    if (window.confirm("Mark this as resolved?")) {
      onResolve();
    }
  };

  const handleCreateTodo = () => {
    onCreateTodo();
    setTodoFeedback(true);
  };

  useEffect(() => {
    if (todoFeedback) {
      const timer = setTimeout(() => setTodoFeedback(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [todoFeedback]);

  const ageColor = loop.daysSinceCreated >= 14
    ? 'text-rose-500'
    : loop.daysSinceCreated >= 4
      ? 'text-amber-500'
      : 'text-[#93a1a1] dark:text-slate-500';

  const intentConfig = INTENT_CONFIG[loop.intent as Intent];

  return (
    <div className="bg-white dark:bg-slate-800 border border-[#eee8d5] dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => navigate(`/chat/${loop.conversationId}`)}
              className="text-lg font-semibold text-[#073642] dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left truncate"
            >
              {loop.title}
            </button>
            {loop.projectName && (
              <span className="shrink-0 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider rounded">
                {loop.projectName}
              </span>
            )}
            {intentConfig && (
              <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded">
                <span>{intentConfig.icon}</span>
                <span>{intentConfig.label}</span>
              </span>
            )}
          </div>

          <p className="text-sm text-[#586e75] dark:text-slate-400 mb-3 italic">
            {loop.goal || "Goal not explicitly stated"}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${ageColor}`}>
              <Clock size={14} />
              {loop.daysSinceCreated} days open
            </div>
            {loop.topics.slice(0, 4).map((topic) => (
              <span key={topic} className="px-2 py-0.5 bg-[#fdf6e3] dark:bg-slate-900 text-[#93a1a1] dark:text-slate-500 text-[10px] rounded-full border border-[#eee8d5] dark:border-slate-800">
                {topic}
              </span>
            ))}
            {loop.topics.length > 4 && (
              <span className="text-[10px] text-[#93a1a1] dark:text-slate-500">+{loop.topics.length - 4} more</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
          <div className="relative">
            <button
              onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors border border-slate-200 dark:border-slate-600"
            >
              <Calendar size={14} />
              Snooze
            </button>

            {showSnoozeOptions && (
              <div className="absolute right-0 mt-2 w-32 bg-white dark:bg-slate-800 border border-[#eee8d5] dark:border-slate-700 rounded-lg shadow-xl z-10 py-1 overflow-hidden">
                <button onClick={() => handleSnooze(1)} className="w-full text-left px-3 py-2 text-xs hover:bg-[#fdf6e3] dark:hover:bg-slate-700 text-[#073642] dark:text-slate-300 transition-colors border-b border-[#eee8d5] dark:border-slate-700 last:border-0">1 week</button>
                <button onClick={() => handleSnooze(2)} className="w-full text-left px-3 py-2 text-xs hover:bg-[#fdf6e3] dark:hover:bg-slate-700 text-[#073642] dark:text-slate-300 transition-colors border-b border-[#eee8d5] dark:border-slate-700 last:border-0">2 weeks</button>
                <button onClick={() => handleSnooze(4)} className="w-full text-left px-3 py-2 text-xs hover:bg-[#fdf6e3] dark:hover:bg-slate-700 text-[#073642] dark:text-slate-300 transition-colors border-b border-[#eee8d5] dark:border-slate-700 last:border-0">1 month</button>
              </div>
            )}
          </div>

          <button
            onClick={handleCreateTodo}
            disabled={todoFeedback}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${
              todoFeedback
                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
            }`}
          >
            {todoFeedback ? <CheckCircle size={14} /> : <ListPlus size={14} />}
            {todoFeedback ? 'Added ✓' : 'To-Do'}
          </button>

          <button
            onClick={handleResolve}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors border border-rose-200 dark:border-rose-800"
          >
            <CheckCircle size={14} />
            Resolve
          </button>
        </div>
      </div>
    </div>
  );
}
