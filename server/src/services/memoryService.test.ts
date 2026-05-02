import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./nvidiaService', () => ({
  summarizeNvidia: vi.fn(),
  isNvidiaAvailable: vi.fn(),
}));

vi.mock('./geminiService', () => ({
  summarizeGemini: vi.fn(),
}));

import { readMemory, writeMemory, updateMemoryFromConversation, getMemoryFilePath } from './memoryService';
import { summarizeNvidia, isNvidiaAvailable } from './nvidiaService';
import { summarizeGemini } from './geminiService';
import { logger } from '../utils/logger';

describe('memoryService v4.0', () => {
  const mockMemoryPath = getMemoryFilePath();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readMemory', () => {
    it('returns null and logs a warning when user-memory.md does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = readMemory();
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('user-memory.md not found'));
    });

    it('returns the file contents when user-memory.md exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# User Memory\n\n- Name: Alice');
      const result = readMemory();
      expect(result).toBe('# User Memory\n\n- Name: Alice');
    });

    it('returns null and logs a warning when reading fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });
      const result = readMemory();
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to read user-memory.md'));
    });
  });

  describe('writeMemory', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.renameSync).mockReturnValue(undefined);
    });

    it('writes memory to the correct file path atomically', () => {
      writeMemory('# Memory content');
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(mockMemoryPath), { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.tmp'), '# Memory content', 'utf8');
      expect(fs.renameSync).toHaveBeenCalledWith(expect.stringContaining('.tmp'), mockMemoryPath);
    });

    it('enforces the 4000-word limit and logs a warning when exceeded', () => {
      const overLimitContent = Array(4100).fill('word').join(' ');
      writeMemory(overLimitContent);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('exceeds'));
      const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const wordCount = written.trim().split(/\s+/).length;
      expect(wordCount).toBe(4000);
    });
  });

  describe('updateMemoryFromConversation', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.renameSync).mockReturnValue(undefined);
    });

    it('uses NVIDIA Llama 3.1 405B for memory updates when available', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('# Existing Memory');
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(summarizeNvidia).mockResolvedValue('# Updated Memory');

        await updateMemoryFromConversation('User fact: I love cats');

        expect(summarizeNvidia).toHaveBeenCalledWith(
            expect.stringContaining('User fact: I love cats'),
            'meta/llama-3.1-405b-instruct'
        );
        expect(fs.writeFileSync).toHaveBeenCalledWith(expect.anything(), '# Updated Memory', 'utf8');
    });

    it('falls back to Gemini if NVIDIA fails', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(true);
        vi.mocked(summarizeNvidia).mockRejectedValue(new Error('NVIDIA fail'));
        vi.mocked(summarizeGemini).mockResolvedValue('# Gemini Memory');

        await updateMemoryFromConversation('test');

        expect(summarizeGemini).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalledWith(expect.anything(), '# Gemini Memory', 'utf8');
    });

    it('uses Gemini immediately if NVIDIA is not available', async () => {
        vi.mocked(isNvidiaAvailable).mockReturnValue(false);
        vi.mocked(summarizeGemini).mockResolvedValue('# Gemini Only');

        await updateMemoryFromConversation('test');

        expect(summarizeNvidia).not.toHaveBeenCalled();
        expect(summarizeGemini).toHaveBeenCalled();
    });
  });
});
