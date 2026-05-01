import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileUpload } from './useFileUpload';

vi.mock('../api/files', () => ({
  uploadFile: vi.fn(),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}));

import { uploadFile, deleteFile } from '../api/files';

const makeFile = (name = 'test.txt') => new File(['content'], name, { type: 'text/plain' });

const attachment = { fileId: 'uuid-1', filename: 'test.txt', mimeType: 'text/plain', size: 7 };

describe('useFileUpload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty attachments and not uploading', () => {
    const { result } = renderHook(() => useFileUpload('conv-1'));
    expect(result.current.attachments).toEqual([]);
    expect(result.current.uploading).toBe(false);
    expect(result.current.uploadError).toBeNull();
  });

  it('upload adds attachment on success', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment);
    const { result } = renderHook(() => useFileUpload('conv-1'));

    await act(async () => {
      await result.current.upload([makeFile()]);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].fileId).toBe('uuid-1');
    expect(result.current.uploading).toBe(false);
  });

  it('upload sets uploadError on failure', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('File too large'));
    const { result } = renderHook(() => useFileUpload('conv-1'));

    await act(async () => {
      await result.current.upload([makeFile()]);
    });

    expect(result.current.uploadError).toBe('File too large');
    expect(result.current.attachments).toHaveLength(0);
  });

  it('upload is a no-op when conversationId is null', async () => {
    const { result } = renderHook(() => useFileUpload(null));

    await act(async () => {
      await result.current.upload([makeFile()]);
    });

    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('remove deletes attachment from state and calls deleteFile', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment);
    const { result } = renderHook(() => useFileUpload('conv-1'));

    await act(async () => {
      await result.current.upload([makeFile()]);
    });

    await act(async () => {
      await result.current.remove('uuid-1');
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(deleteFile).toHaveBeenCalledWith('conv-1', 'uuid-1');
  });

  it('remove is a no-op when conversationId is null', async () => {
    const { result } = renderHook(() => useFileUpload(null));
    await act(async () => { await result.current.remove('uuid-1'); });
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('clear resets attachments and error', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('oops'));
    const { result } = renderHook(() => useFileUpload('conv-1'));

    await act(async () => { await result.current.upload([makeFile()]); });
    expect(result.current.uploadError).toBeTruthy();

    act(() => { result.current.clear(); });
    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.uploadError).toBeNull();
  });

  it('upload accepts FileList-like objects', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment);
    const { result } = renderHook(() => useFileUpload('conv-1'));
    const files = [makeFile('a.txt'), makeFile('b.txt')];
    vi.mocked(uploadFile)
      .mockResolvedValueOnce({ ...attachment, fileId: 'uuid-a', filename: 'a.txt' })
      .mockResolvedValueOnce({ ...attachment, fileId: 'uuid-b', filename: 'b.txt' });

    await act(async () => { await result.current.upload(files); });
    expect(result.current.attachments).toHaveLength(2);
  });
});
