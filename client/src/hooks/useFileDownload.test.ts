import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileDownload } from './useFileDownload';

describe('useFileDownload', () => {
  let createdAnchor: HTMLAnchorElement | null = null;
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        createdAnchor = el as HTMLAnchorElement;
        vi.spyOn(el as HTMLAnchorElement, 'click');
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    createdAnchor = null;
  });

  it('creates an anchor element with the correct href', () => {
    const { result } = renderHook(() => useFileDownload());
    act(() => {
      result.current.download('conv-abc', 'file-uuid-123', 'report.pdf');
    });
    expect(createdAnchor).not.toBeNull();
    expect(createdAnchor!.href).toContain('/api/conversations/conv-abc/downloads/file-uuid-123');
  });

  it('sets the download attribute to the filename', () => {
    const { result } = renderHook(() => useFileDownload());
    act(() => {
      result.current.download('conv-1', 'uuid-xyz', 'script.py');
    });
    expect(createdAnchor!.download).toBe('script.py');
  });

  it('calls click() on the anchor', () => {
    const { result } = renderHook(() => useFileDownload());
    act(() => {
      result.current.download('conv-1', 'uuid-xyz', 'output.txt');
    });
    expect(createdAnchor!.click).toHaveBeenCalledTimes(1);
  });

  it('uses correct URL format for different conversation and file IDs', () => {
    const { result } = renderHook(() => useFileDownload());
    act(() => {
      result.current.download('my-conv', 'my-file-id', 'data.csv');
    });
    expect(createdAnchor!.href).toContain('/api/conversations/my-conv/downloads/my-file-id');
    expect(createdAnchor!.download).toBe('data.csv');
  });
});
