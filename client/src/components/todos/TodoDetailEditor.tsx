import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Todo, TodoAlarm, TodoRecurrence, TodoUpdateFields, RecurrenceFrequency, TodoPriority, TodoStatus } from '../../types';
import { clsx } from 'clsx';

interface TodoDetailEditorProps {
  todo: Todo;
  onClose: () => void;
  onSave: (updates: TodoUpdateFields) => Promise<void>;
}

function formatTriggerLabel(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs} minutes before`;
  if (abs === 60) return '1 hour before';
  if (abs < 1440) return `${abs / 60} hours before`;
  if (abs === 1440) return '1 day before';
  return `${abs / 1440} days before`;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface EditorState {
  text: string;
  notes: string;
  location: string;
  url: string;
  dueDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  hasRecurrence: boolean;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceInterval: number;
  recurrenceUntil: string;
  recurrenceCount: string;
  alarms: TodoAlarm[];
  priority: TodoPriority;
  status: TodoStatus;
}

function todoToState(todo: Todo): EditorState {
  return {
    text: todo.text,
    notes: todo.notes ?? '',
    location: todo.location ?? '',
    url: todo.url ?? '',
    dueDate: todo.dueDate ?? '',
    allDay: todo.allDay,
    startTime: todo.startTime ?? '',
    endTime: todo.endTime ?? '',
    hasRecurrence: todo.recurrence !== null,
    recurrenceFrequency: todo.recurrence?.frequency ?? 'WEEKLY',
    recurrenceInterval: todo.recurrence?.interval ?? 1,
    recurrenceUntil: todo.recurrence?.until ?? '',
    recurrenceCount: todo.recurrence?.count ? String(todo.recurrence.count) : '',
    alarms: todo.alarms ?? [],
    priority: todo.priority,
    status: todo.status,
  };
}

export default function TodoDetailEditor({ todo, onClose, onSave }: TodoDetailEditorProps) {
  const [state, setState] = useState<EditorState>(() => todoToState(todo));
  const [isSaving, setIsSaving] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [endTimeError, setEndTimeError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Track sheet drag state
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Focus trap
  useEffect(() => {
    const el = sheetRef.current ?? overlayRef.current;
    if (el) {
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable[0]?.focus();
    }
  }, []);

  const set = (patch: Partial<EditorState>) => setState(s => ({ ...s, ...patch }));

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Sheet drag handlers (mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    dragCurrentY.current = delta;
    if (sheetRef.current && delta > 0) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  };
  const handleTouchEnd = () => {
    if (dragCurrentY.current > 120) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
  };

  const addAlarm = () => {
    const alarm: TodoAlarm = {
      id: randomId(),
      trigger: -15,
      action: 'DISPLAY',
      description: todo.text,
    };
    set({ alarms: [...state.alarms, alarm] });
  };

  const updateAlarm = (id: string, patch: Partial<TodoAlarm>) => {
    set({ alarms: state.alarms.map(a => a.id === id ? { ...a, ...patch } : a) });
  };

  const removeAlarm = (id: string) => {
    set({ alarms: state.alarms.filter(a => a.id !== id) });
  };

  const validateUrl = () => {
    if (!state.url) { setUrlError(''); return; }
    try { new URL(state.url); setUrlError(''); }
    catch { setUrlError('Enter a valid URL'); }
  };

  const validateEndTime = () => {
    if (!state.endTime || !state.startTime) { setEndTimeError(''); return; }
    if (state.endTime <= state.startTime) {
      setEndTimeError('End time must be after start time');
    } else {
      setEndTimeError('');
    }
  };

  const handleSave = async () => {
    if (urlError || endTimeError) return;
    setIsSaving(true);
    try {
      const updates: TodoUpdateFields = {};

      if (state.text !== todo.text) updates.text = state.text;
      if ((state.notes || null) !== todo.notes) updates.notes = state.notes || null;
      if ((state.location || null) !== todo.location) updates.location = state.location || null;
      if ((state.url || null) !== todo.url) updates.url = state.url || null;
      if ((state.dueDate || null) !== todo.dueDate) updates.dueDate = state.dueDate || null;
      if (state.allDay !== todo.allDay) updates.allDay = state.allDay;
      if ((state.startTime || null) !== todo.startTime) updates.startTime = state.startTime || null;
      if ((state.endTime || null) !== todo.endTime) updates.endTime = state.endTime || null;
      if (state.priority !== todo.priority) updates.priority = state.priority;
      if (state.status !== todo.status) updates.status = state.status;

      const newRecurrence: TodoRecurrence | null = state.hasRecurrence
        ? {
            frequency: state.recurrenceFrequency,
            interval: state.recurrenceInterval,
            until: state.recurrenceUntil || null,
            count: state.recurrenceCount ? parseInt(state.recurrenceCount, 10) : null,
          }
        : null;

      const recurrenceChanged = JSON.stringify(newRecurrence) !== JSON.stringify(todo.recurrence);
      if (recurrenceChanged) updates.recurrence = newRecurrence;

      const alarmsChanged = JSON.stringify(state.alarms) !== JSON.stringify(todo.alarms);
      if (alarmsChanged) updates.alarms = state.alarms;

      if (Object.keys(updates).length > 0) {
        await onSave(updates);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const dueDateChanging = (state.dueDate || null) !== todo.dueDate;
  const settingDate = dueDateChanging && !!state.dueDate && !todo.dueDate;
  const clearingDate = dueDateChanging && !state.dueDate && !!todo.dueDate;

  const content = (
    <div ref={sheetRef} className={clsx(
      'bg-[#fdf6e3] dark:bg-slate-900 flex flex-col overflow-hidden',
      // Mobile: slide-up sheet
      'md:rounded-2xl md:shadow-2xl md:max-w-[560px] md:w-full md:max-h-[80vh]',
      // Mobile specific
      'max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:h-[90vh] max-md:rounded-t-2xl max-md:shadow-2xl',
    )}
      style={{ transition: 'transform 0.2s ease' }}
    >
      {/* Drag handle (mobile only) */}
      <div
        className="md:hidden flex justify-center pt-3 pb-1 shrink-0 cursor-grab"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-10 h-1 bg-[#ccc5af] dark:bg-slate-700 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#ccc5af] dark:border-slate-700 shrink-0">
        <h2 className="text-lg font-bold text-[#073642] dark:text-white">Edit To-Do</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-[#e0d8c4] dark:hover:bg-slate-800 text-[#93a1a1] dark:text-slate-400 transition-colors"
          aria-label="Close editor"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* Event Details */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#93a1a1] dark:text-slate-500 mb-4">Event Details</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="editor-title" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Title</label>
              <input
                id="editor-title"
                type="text"
                value={state.text}
                onChange={e => set({ text: e.target.value.slice(0, 120) })}
                maxLength={120}
                className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="editor-notes" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Notes</label>
              <textarea
                id="editor-notes"
                value={state.notes}
                onChange={e => set({ notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div>
              <label htmlFor="editor-location" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Location</label>
              <input
                id="editor-location"
                type="text"
                value={state.location}
                onChange={e => set({ location: e.target.value })}
                className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="editor-url" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">URL</label>
              <input
                id="editor-url"
                type="url"
                value={state.url}
                onChange={e => set({ url: e.target.value })}
                onBlur={validateUrl}
                className={clsx(
                  'w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500',
                  urlError ? 'border-rose-400 dark:border-rose-600' : 'border-[#ccc5af] dark:border-slate-700'
                )}
              />
              {urlError && <p className="text-xs text-rose-500 mt-1">{urlError}</p>}
            </div>
          </div>
        </section>

        {/* Date & Time */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#93a1a1] dark:text-slate-500 mb-4">Date &amp; Time</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="editor-date" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Date</label>
              <input
                id="editor-date"
                type="date"
                value={state.dueDate}
                onChange={e => set({ dueDate: e.target.value })}
                className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {settingDate && (
                <p className="text-xs text-indigo-500 mt-1">Setting a date will publish this to your calendar.</p>
              )}
              {clearingDate && (
                <p className="text-xs text-amber-500 mt-1">Clearing the date will remove this from your calendar.</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={state.allDay}
                  onChange={e => set({ allDay: e.target.checked })}
                  className="w-4 h-4 rounded accent-indigo-600"
                />
                <span className="text-sm text-[#073642] dark:text-white">All day</span>
              </label>
            </div>

            {!state.allDay && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="editor-start-time" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Start time</label>
                  <input
                    id="editor-start-time"
                    type="time"
                    value={state.startTime}
                    onChange={e => set({ startTime: e.target.value })}
                    className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="editor-end-time" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">End time</label>
                  <input
                    id="editor-end-time"
                    type="time"
                    value={state.endTime}
                    onChange={e => set({ endTime: e.target.value })}
                    onBlur={validateEndTime}
                    className={clsx(
                      'w-full rounded-lg border bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500',
                      endTimeError ? 'border-rose-400 dark:border-rose-600' : 'border-[#ccc5af] dark:border-slate-700'
                    )}
                  />
                  {endTimeError && <p className="text-xs text-rose-500 mt-1">{endTimeError}</p>}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Recurrence */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#93a1a1] dark:text-slate-500 mb-4">Recurrence</h3>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={state.hasRecurrence}
                onChange={e => set({ hasRecurrence: e.target.checked })}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span className="text-sm text-[#073642] dark:text-white">Repeat</span>
            </label>

            {state.hasRecurrence && (
              <div className="space-y-4 pl-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="editor-freq" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Frequency</label>
                    <select
                      id="editor-freq"
                      value={state.recurrenceFrequency}
                      onChange={e => set({ recurrenceFrequency: e.target.value as RecurrenceFrequency })}
                      className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                      <option value="YEARLY">Yearly</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="editor-interval" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Every N</label>
                    <input
                      id="editor-interval"
                      type="number"
                      min={1}
                      step={1}
                      value={state.recurrenceInterval}
                      onChange={e => set({ recurrenceInterval: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="editor-until" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">End date</label>
                    <input
                      id="editor-until"
                      type="date"
                      value={state.recurrenceUntil}
                      onChange={e => set({ recurrenceUntil: e.target.value, recurrenceCount: '' })}
                      className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="editor-count" className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">End after N occurrences</label>
                    <input
                      id="editor-count"
                      type="number"
                      min={1}
                      step={1}
                      value={state.recurrenceCount}
                      onChange={e => set({ recurrenceCount: e.target.value, recurrenceUntil: '' })}
                      placeholder="No limit"
                      className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Reminders */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#93a1a1] dark:text-slate-500 mb-4">Reminders</h3>
          <div className="space-y-3">
            {state.alarms.map(alarm => (
              <div key={alarm.id} className="flex items-start gap-3 p-3 rounded-xl bg-[#eee8d5] dark:bg-slate-800">
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">
                        Trigger (min before)
                      </label>
                      <div className="flex gap-1 mb-1 flex-wrap">
                        {[-15, -30, -60, -1440].map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => updateAlarm(alarm.id, { trigger: preset })}
                            className={clsx(
                              'px-2 py-0.5 text-[10px] font-medium rounded border transition-colors',
                              alarm.trigger === preset
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-700 border-[#ccc5af] dark:border-slate-600 text-[#586e75] dark:text-slate-400 hover:border-indigo-400'
                            )}
                          >
                            {preset === -15 ? '15 min' : preset === -30 ? '30 min' : preset === -60 ? '1 hr' : '1 day'}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={Math.abs(alarm.trigger)}
                        onChange={e => updateAlarm(alarm.id, { trigger: -(parseInt(e.target.value) || 15) })}
                        className="w-full rounded border border-[#ccc5af] dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5">{formatTriggerLabel(alarm.trigger)}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Action</label>
                      <select
                        value={alarm.action}
                        onChange={e => updateAlarm(alarm.id, { action: e.target.value as 'DISPLAY' | 'EMAIL' })}
                        className="w-full rounded border border-[#ccc5af] dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="DISPLAY">Notification</option>
                        <option value="EMAIL">Email</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`alarm-${alarm.id}-desc`} className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Message</label>
                    <input
                      id={`alarm-${alarm.id}-desc`}
                      type="text"
                      value={alarm.description}
                      onChange={e => updateAlarm(alarm.id, { description: e.target.value })}
                      className="w-full rounded border border-[#ccc5af] dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <button
                  onClick={() => removeAlarm(alarm.id)}
                  className="mt-1 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-[#93a1a1] dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  aria-label="Remove reminder"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button
              onClick={addAlarm}
              className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              <Plus size={14} />
              Add reminder
            </button>
          </div>
        </section>

        {/* Priority & Status */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#93a1a1] dark:text-slate-500 mb-4">Priority &amp; Status</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-2">Priority</label>
              <div className="flex gap-2">
                {(['now', 'soon', 'someday'] as TodoPriority[]).map(p => (
                  <button
                    key={p}
                    onClick={() => set({ priority: p })}
                    className={clsx(
                      'flex-1 py-2 text-sm font-medium rounded-lg border capitalize transition-colors',
                      state.priority === p
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-800 border-[#ccc5af] dark:border-slate-700 text-[#586e75] dark:text-slate-400 hover:border-indigo-400 dark:hover:border-indigo-600'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Status</label>
              <select
                value={state.status}
                onChange={e => set({ status: e.target.value as TodoStatus })}
                className="w-full rounded-lg border border-[#ccc5af] dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-[#073642] dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="open">Open</option>
                <option value="done">Done</option>
                <option value="snoozed">Snoozed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#586e75] dark:text-slate-400 mb-1">Calendar status</label>
              <span className={clsx(
                'inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full',
                todo.calendarStatus === 'published'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              )}>
                {todo.calendarStatus === 'published' ? 'Published' : 'Pending'}
              </span>
              <p className="text-xs text-[#93a1a1] dark:text-slate-500 mt-1">
                {todo.calendarStatus === 'published'
                  ? 'This to-do appears in your calendar.'
                  : 'Set a date to publish this to your calendar.'}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#ccc5af] dark:border-slate-700 shrink-0">
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl border border-[#ccc5af] dark:border-slate-700 text-[#586e75] dark:text-slate-400 hover:bg-[#eee8d5] dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !!urlError || !!endTimeError}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {settingDate && !isSaving && (
          <p className="text-xs text-indigo-500 text-center mt-2">Setting a date will publish this to your calendar.</p>
        )}
        {clearingDate && !isSaving && (
          <p className="text-xs text-amber-500 text-center mt-2">Clearing the date will remove this from your calendar.</p>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center md:justify-center"
      aria-modal="true"
      role="dialog"
    >
      {content}
    </div>
  );
}
