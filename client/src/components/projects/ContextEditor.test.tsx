import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextEditor from './ContextEditor';

describe('ContextEditor', () => {
  it('renders textarea with initial content', () => {
    render(<ContextEditor projectId="p1" initialContent="# My Context" onSave={vi.fn()} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('# My Context');
  });

  it('does not show Save/Discard buttons when content is unchanged', () => {
    render(<ContextEditor projectId="p1" initialContent="# My Context" onSave={vi.fn()} />);
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
    expect(screen.queryByText('Discard')).not.toBeInTheDocument();
  });

  it('shows Save and Discard buttons when content changes', () => {
    render(<ContextEditor projectId="p1" initialContent="# My Context" onSave={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Changed' } });
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });

  it('calls onSave with updated content', () => {
    const onSave = vi.fn();
    render(<ContextEditor projectId="p1" initialContent="# My Context" onSave={onSave} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Updated' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('# Updated');
  });

  it('discards changes when Discard is clicked', () => {
    render(<ContextEditor projectId="p1" initialContent="# Original" onSave={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Changed' } });
    fireEvent.click(screen.getByText('Discard'));
    expect(screen.getByRole('textbox')).toHaveValue('# Original');
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('hides buttons after save', () => {
    render(<ContextEditor projectId="p1" initialContent="# Original" onSave={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Changed' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('shows Saving... text when isSaving is true', () => {
    render(<ContextEditor projectId="p1" initialContent="# Original" onSave={vi.fn()} isSaving />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# Changed' } });
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('resets when initialContent prop changes', () => {
    const { rerender } = render(<ContextEditor projectId="p1" initialContent="# V1" onSave={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# V1 modified' } });
    rerender(<ContextEditor projectId="p1" initialContent="# V2" onSave={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveValue('# V2');
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });
});
