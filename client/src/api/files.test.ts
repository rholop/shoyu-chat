import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadFile, deleteFile, getFileUrl } from './files';

afterEach(() => vi.restoreAllMocks());

describe('uploadFile', () => {
  it('POSTs to /api/files/upload with FormData and returns Attachment', async () => {
    const attachment = { fileId: 'uuid-1', filename: 'test.txt', mimeType: 'text/plain', size: 42 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(attachment),
    }));

    const file = new File(['hello'], 'test.txt', { type: 'text/plain' });
    const result = await uploadFile('conv-1', file);

    expect(fetch).toHaveBeenCalledWith('/api/files/upload', expect.objectContaining({ method: 'POST' }));
    expect(result).toEqual(attachment);
  });

  it('throws with error message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'File too large' }),
    }));

    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    await expect(uploadFile('conv-1', file)).rejects.toThrow('File too large');
  });

  it('throws Upload failed when error body has no error field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error('not json')),
    }));

    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    await expect(uploadFile('conv-1', file)).rejects.toThrow('Upload failed');
  });
});

describe('deleteFile', () => {
  it('sends DELETE to /api/files/:conversationId/:fileId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    }));

    await deleteFile('conv-1', 'file-id');

    expect(fetch).toHaveBeenCalledWith(
      '/api/files/conv-1/file-id',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('getFileUrl', () => {
  it('returns the correct URL', () => {
    expect(getFileUrl('conv-1', 'file-id')).toBe('/api/files/conv-1/file-id');
  });
});
