import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AttachmentChip from './AttachmentChip';
import { Attachment } from '../../types';

vi.mock('../../api/files', () => ({
  getFileUrl: (convId: string, fileId: string) => `/api/files/${convId}/${fileId}`,
}));

const textAttachment: Attachment = {
  fileId: 'file-1',
  filename: 'notes.txt',
  mimeType: 'text/plain',
  size: 1024,
};

const imageAttachment: Attachment = {
  fileId: 'file-2',
  filename: 'photo.png',
  mimeType: 'image/png',
  size: 51200,
};

describe('AttachmentChip', () => {
  it('renders the filename', () => {
    render(<AttachmentChip attachment={textAttachment} />);
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
  });

  it('renders the file size formatted', () => {
    render(<AttachmentChip attachment={textAttachment} />);
    expect(screen.getByText('1KB')).toBeInTheDocument();
  });

  it('renders an img tag for image attachments when conversationId is provided', () => {
    render(<AttachmentChip attachment={imageAttachment} conversationId="conv-1" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/files/conv-1/file-2');
    expect(img).toHaveAttribute('alt', 'photo.png');
  });

  it('does not render img tag when no conversationId', () => {
    render(<AttachmentChip attachment={imageAttachment} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders an anchor link when conversationId is provided', () => {
    render(<AttachmentChip attachment={textAttachment} conversationId="conv-1" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/api/files/conv-1/file-1');
  });

  it('does not render anchor link when no conversationId', () => {
    render(<AttachmentChip attachment={textAttachment} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders remove button when onRemove is provided', () => {
    render(<AttachmentChip attachment={textAttachment} onRemove={vi.fn()} />);
    expect(screen.getByRole('button', { name: /remove notes\.txt/i })).toBeInTheDocument();
  });

  it('does not render remove button when onRemove is absent', () => {
    render(<AttachmentChip attachment={textAttachment} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', async () => {
    const onRemove = vi.fn();
    render(<AttachmentChip attachment={textAttachment} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('displays MB for large files', () => {
    const big: Attachment = { ...textAttachment, size: 2 * 1024 * 1024 };
    render(<AttachmentChip attachment={big} />);
    expect(screen.getByText('2.0MB')).toBeInTheDocument();
  });
});
