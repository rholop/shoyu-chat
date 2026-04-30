import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModelBadge from './ModelBadge';

describe('ModelBadge', () => {
  it('renders nothing when model is null', () => {
    const { container } = render(<ModelBadge model={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders "Groq" for groq-chat', () => {
    render(<ModelBadge model="groq-chat" />);
    expect(screen.getByText('Groq')).toBeInTheDocument();
  });

  it('renders "Groq⚡" for groq-compound', () => {
    render(<ModelBadge model="groq-compound" />);
    expect(screen.getByText('Groq⚡')).toBeInTheDocument();
  });

  it('renders "Gemini" for gemini', () => {
    render(<ModelBadge model="gemini" />);
    expect(screen.getByText('Gemini')).toBeInTheDocument();
  });

  it('renders "OpenRouter" for openrouter', () => {
    render(<ModelBadge model="openrouter" />);
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
  });

  it('renders the raw model string for unknown models', () => {
    render(<ModelBadge model="some-unknown-model" />);
    expect(screen.getByText('some-unknown-model')).toBeInTheDocument();
  });

  it('applies orange colors for groq-chat', () => {
    render(<ModelBadge model="groq-chat" />);
    const badge = screen.getByText('Groq');
    expect(badge.className).toContain('bg-orange-500/20');
    expect(badge.className).toContain('text-orange-300');
  });

  it('applies blue colors for gemini', () => {
    render(<ModelBadge model="gemini" />);
    const badge = screen.getByText('Gemini');
    expect(badge.className).toContain('bg-blue-500/20');
    expect(badge.className).toContain('text-blue-300');
  });

  it('applies purple colors for openrouter', () => {
    render(<ModelBadge model="openrouter" />);
    const badge = screen.getByText('OpenRouter');
    expect(badge.className).toContain('bg-purple-500/20');
    expect(badge.className).toContain('text-purple-300');
  });

  it('applies fallback slate colors for unknown model', () => {
    render(<ModelBadge model="unknown-model" />);
    const badge = screen.getByText('unknown-model');
    expect(badge.className).toContain('bg-slate-500/20');
  });
});
