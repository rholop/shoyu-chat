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
    expect(screen.getByText(/Gemini/)).toBeInTheDocument();
  });

  it('renders "OpenRouter" for openrouter', () => {
    render(<ModelBadge model="openrouter" />);
    expect(screen.getByText(/Mistral Large/)).toBeInTheDocument();
  });

  it('renders the raw model string for unknown models', () => {
    render(<ModelBadge model="some-unknown-model" />);
    expect(screen.getByText('some-unknown-model')).toBeInTheDocument();
  });

  it('applies orange colors for groq-chat', () => {
    const { container } = render(<ModelBadge model="groq-chat" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-orange-500/20');
    expect(badge.className).toContain('text-orange-300');
  });

  it('applies blue colors for gemini', () => {
    const { container } = render(<ModelBadge model="gemini" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-blue-500/20');
    expect(badge.className).toContain('text-blue-300');
  });

  it('applies purple colors for openrouter', () => {
    const { container } = render(<ModelBadge model="openrouter" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-purple-500/20');
    expect(badge.className).toContain('text-purple-300');
  });

  it('applies fallback slate colors for unknown model', () => {
    const { container } = render(<ModelBadge model="unknown-model" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-slate-500/20');
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
