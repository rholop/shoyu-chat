import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModelBadge from './ModelBadge';
import { Intent } from '../../types';

describe('ModelBadge', () => {
  it('renders nothing when model is null', () => {
    const { container } = render(<ModelBadge model={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Llama 3.3 70B" label for groq-chat', () => {
    render(<ModelBadge model="groq-chat" />);
    expect(screen.getByText('Llama 3.3 70B')).toBeInTheDocument();
  });

  it('renders "Groq⚡" for groq-compound', () => {
    render(<ModelBadge model="groq-compound" />);
    expect(screen.getByText(/Groq⚡/)).toBeInTheDocument();
  });

  it('renders "Gemini" for gemini', () => {
    render(<ModelBadge model="gemini" />);
    expect(screen.getByText(/Gemini 2.5 Flash/)).toBeInTheDocument();
  });

  it('renders "OR" for openrouter', () => {
    render(<ModelBadge model="openrouter" />);
    expect(screen.getByText(/OR/)).toBeInTheDocument();
  });

  it('renders the raw model string for unknown models', () => {
    render(<ModelBadge model="some-unknown-model" />);
    expect(screen.getByText('some-unknown-model')).toBeInTheDocument();
  });

  it('applies orange colors for groq-chat', () => {
    const { container } = render(<ModelBadge model="groq-chat" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-orange-100');
    expect(badge.className).toContain('text-orange-900');
    expect(badge.className).toContain('dark:bg-orange-900/40');
    expect(badge.className).toContain('dark:text-orange-100');
  });

  it('applies blue colors for gemini', () => {
    const { container } = render(<ModelBadge model="gemini" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-blue-100');
    expect(badge.className).toContain('text-blue-900');
    expect(badge.className).toContain('dark:bg-blue-900/40');
    expect(badge.className).toContain('dark:text-blue-100');
  });

  it('applies purple colors for openrouter', () => {
    const { container } = render(<ModelBadge model="openrouter" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-purple-100');
    expect(badge.className).toContain('text-purple-900');
    expect(badge.className).toContain('dark:bg-purple-900/40');
    expect(badge.className).toContain('dark:text-purple-100');
  });

  it('applies fallback slate colors for unknown model', () => {
    const { container } = render(<ModelBadge model="unknown-model" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-slate-100');
    expect(badge.className).toContain('dark:bg-slate-900/40');
  });

  it('shows intent icon when intent prop is provided', () => {
    render(<ModelBadge model="gemini" intent={Intent.WEB_SEARCH} />);
    expect(screen.getByText('🌐')).toBeInTheDocument();
  });

  it('shows CODING icon (💻) when model is nvidia', () => {
    render(<ModelBadge model="nvidia" />);
    expect(screen.getByText('💻')).toBeInTheDocument();
  });

  it('shows DEBUGGING icon (🐞) when model is groq-chat with DEBUGGING intent', () => {
    render(<ModelBadge model="groq-chat" intent={Intent.DEBUGGING} />);
    expect(screen.getByText('🐞')).toBeInTheDocument();
  });

  it('shows SUMMARIZING icon when intent=SUMMARIZING overrides gemini default', () => {
    render(<ModelBadge model="gemini" intent={Intent.SUMMARIZING} />);
    expect(screen.getByText('📝')).toBeInTheDocument();
  });

  it('shows no icon for an unknown model with no intent', () => {
    render(<ModelBadge model="unknown-model" />);
    // Unknown model has no mapped intent icon
    expect(screen.queryByText('🌐')).toBeNull();
    expect(screen.queryByText('💻')).toBeNull();
  });
});
