import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import TodoDetailEditor from './TodoDetailEditor';
import { Todo, TodoUpdateFields } from '../../types';

const baseTodo: Todo = {
  id: 't1',
  conversationId: 'conversation-c1',
  text: 'Test todo',
  priority: 'now',
  status: 'open',
  projectId: null,
  projectName: null,
  intent: 'GENERAL',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  dueDate: null,
  snoozedUntil: null,
  sourceMessageHint: 'Hint',
  calendarStatus: 'pending',
  startTime: null,
  endTime: null,
  location: null,
  url: null,
  notes: null,
  alarms: [],
  recurrence: null,
  allDay: true,
};

const publishedTodo: Todo = {
  ...baseTodo,
  dueDate: '2026-05-10',
  calendarStatus: 'published',
};

describe('TodoDetailEditor', () => {
  let onClose: () => void;
  let onSave: (updates: TodoUpdateFields) => Promise<void>;

  beforeEach(() => {
    onClose = vi.fn() as unknown as () => void;
    onSave = vi.fn().mockResolvedValue(undefined) as unknown as (updates: TodoUpdateFields) => Promise<void>;
  });

  const renderEditor = (todo = baseTodo) =>
    render(<TodoDetailEditor todo={todo} onClose={onClose} onSave={onSave} />);

  it('renders all field sections', () => {
    renderEditor();
    expect(screen.getByText('Event Details')).toBeInTheDocument();
    expect(screen.getByText('Date & Time')).toBeInTheDocument();
    expect(screen.getByText('Recurrence')).toBeInTheDocument();
    expect(screen.getByText('Reminders')).toBeInTheDocument();
    expect(screen.getByText('Priority & Status')).toBeInTheDocument();
  });

  it('shows allDay checkbox checked by default', () => {
    renderEditor();
    const checkbox = screen.getByRole('checkbox', { name: /all day/i });
    expect(checkbox).toBeChecked();
  });

  it('hides startTime and endTime when allDay is on', () => {
    renderEditor();
    expect(screen.queryByLabelText(/start time/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/end time/i)).not.toBeInTheDocument();
  });

  it('shows startTime and endTime when allDay is toggled off', () => {
    renderEditor();
    const allDayCheckbox = screen.getByRole('checkbox', { name: /all day/i });
    fireEvent.click(allDayCheckbox);
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument();
  });

  it('hides recurrence fields when Repeat is off', () => {
    renderEditor();
    expect(screen.queryByLabelText(/frequency/i)).not.toBeInTheDocument();
  });

  it('shows recurrence fields when Repeat is toggled on', () => {
    renderEditor();
    const repeatCheckbox = screen.getByRole('checkbox', { name: /repeat/i });
    fireEvent.click(repeatCheckbox);
    expect(screen.getByLabelText(/frequency/i)).toBeInTheDocument();
  });

  it('shows "Setting a date will publish" note when dueDate is set for the first time', () => {
    renderEditor(baseTodo);
    const dateInput = screen.getByLabelText(/^date$/i);
    fireEvent.change(dateInput, { target: { value: '2026-06-01' } });
    expect(screen.getAllByText(/setting a date will publish/i).length).toBeGreaterThan(0);
  });

  it('shows "Clearing the date will remove" note when dueDate is cleared', () => {
    renderEditor(publishedTodo);
    const dateInput = screen.getByLabelText(/^date$/i);
    fireEvent.change(dateInput, { target: { value: '' } });
    expect(screen.getAllByText(/clearing the date will remove/i).length).toBeGreaterThan(0);
  });

  it('renders calendarStatus as read-only badge (pending)', () => {
    renderEditor(baseTodo);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    // Should be a span/badge, not an input
    const badge = screen.getByText('Pending');
    expect(badge.tagName.toLowerCase()).not.toBe('input');
  });

  it('renders calendarStatus as read-only badge (published)', () => {
    renderEditor(publishedTodo);
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('"Add reminder" button appends alarm to list', () => {
    renderEditor();
    const addBtn = screen.getByText(/add reminder/i);
    fireEvent.click(addBtn);
    expect(screen.getByText(/minutes before/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
  });

  it('delete alarm button removes alarm', () => {
    const todoWithAlarm: Todo = {
      ...baseTodo,
      alarms: [{ id: 'a1', trigger: -15, action: 'DISPLAY', description: 'Reminder' }]
    };
    renderEditor(todoWithAlarm);
    expect(screen.getByLabelText(/remove reminder/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/remove reminder/i));
    expect(screen.queryByLabelText(/message/i)).not.toBeInTheDocument();
  });

  it('alarm trigger shows human-readable label', () => {
    renderEditor();
    const addBtn = screen.getByText(/add reminder/i);
    fireEvent.click(addBtn);
    expect(screen.getByText('15 minutes before')).toBeInTheDocument();
  });

  it('preset alarm buttons add correct trigger values', () => {
    renderEditor();
    fireEvent.click(screen.getByText(/add reminder/i));
    const hourPreset = screen.getByText('1 hr');
    fireEvent.click(hourPreset);
    expect(screen.getByText('1 hour before')).toBeInTheDocument();
  });

  it('setting until field clears count field', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    const countInput = screen.getByPlaceholderText(/no limit/i);
    fireEvent.change(countInput, { target: { value: '5' } });
    const untilInput = screen.getByLabelText(/end date/i);
    fireEvent.change(untilInput, { target: { value: '2026-12-31' } });
    expect((countInput as HTMLInputElement).value).toBe('');
  });

  it('setting count field clears until field', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    const untilInput = screen.getByLabelText(/end date/i);
    fireEvent.change(untilInput, { target: { value: '2026-12-31' } });
    const countInput = screen.getByPlaceholderText(/no limit/i);
    fireEvent.change(countInput, { target: { value: '10' } });
    expect((untilInput as HTMLInputElement).value).toBe('');
  });

  it('Save button calls onSave with only changed fields', async () => {
    renderEditor();
    const textInput = screen.getByLabelText(/title/i);
    fireEvent.change(textInput, { target: { value: 'Updated text' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const mockSave = onSave as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const updates = mockSave.mock.calls[0][0];
    expect(updates.text).toBe('Updated text');
    expect(updates.status).toBeUndefined();
  });

  it('Save button shows loading state while onSave is pending', async () => {
    onSave = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100))) as unknown as (updates: TodoUpdateFields) => Promise<void>;
    renderEditor();
    const textInput = screen.getByLabelText(/title/i);
    fireEvent.change(textInput, { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument();
  });

  it('Cancel button calls onClose without calling onSave', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    expect(onSave as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('Escape key calls onClose', () => {
    renderEditor();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('clicking backdrop calls onClose', () => {
    renderEditor();
    const backdrop = document.querySelector('[aria-modal="true"]') as HTMLElement;
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });
});
