import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('fs');
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { readMemory, writeMemory, updateMemoryFromConversation, getMemoryFilePath } from './memoryService';
import { logger } from '../utils/logger';

describe('memoryService', () => {
  const mockMemoryPath = getMemoryFilePath();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset DATA_DIR to default
    delete process.env.DATA_DIR;
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
  });

  // ── readMemory ───────────────────────────────────────────────────────────────

  describe('readMemory', () => {
    it('returns null and logs a warning when user-memory.md does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = readMemory();

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('user-memory.md not found')
      );
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
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read user-memory.md')
      );
    });

    it('handles missing file gracefully — does not throw', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => readMemory()).not.toThrow();
    });
  });

  // ── writeMemory ──────────────────────────────────────────────────────────────

  describe('writeMemory', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.renameSync).mockReturnValue(undefined);
    });

    it('writes memory to the correct file path atomically', () => {
      writeMemory('# Memory content');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.dirname(mockMemoryPath),
        { recursive: true }
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        '# Memory content',
        'utf8'
      );
      expect(fs.renameSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        mockMemoryPath
      );
    });

    it('enforces the 4000-word limit and logs a warning when exceeded', () => {
      const overLimitContent = Array(4100).fill('word').join(' ');

      writeMemory(overLimitContent);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('exceeds')
      );
      // Verify the written content is truncated (4000 words = ~4000 space-separated tokens)
      const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      const wordCount = written.trim().split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(4000);
    });

    it('writes content unchanged when under 4000 words', () => {
      const content = 'short content here';

      writeMemory(content);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        content,
        'utf8'
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  // ── updateMemoryFromConversation ─────────────────────────────────────────────

  describe('updateMemoryFromConversation', () => {
    beforeEach(() => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.renameSync).mockReturnValue(undefined);
    });

    it('calls summarizeFn with a prompt containing the existing memory and conversation', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# Existing memory');

      const mockSummarizeFn = vi.fn().mockResolvedValue('# Updated memory');
      await updateMemoryFromConversation('User: Hello\nAssistant: Hi', mockSummarizeFn);

      expect(mockSummarizeFn).toHaveBeenCalledWith(
        expect.stringContaining('# Existing memory')
      );
      expect(mockSummarizeFn).toHaveBeenCalledWith(
        expect.stringContaining('User: Hello')
      );
    });

    it('writes the updated memory when summarizeFn returns content', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('# Old memory');

      const mockSummarizeFn = vi.fn().mockResolvedValue('# New memory content');
      await updateMemoryFromConversation('conversation history', mockSummarizeFn);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.tmp'),
        '# New memory content',
        'utf8'
      );
      expect(logger.info).toHaveBeenCalledWith('User memory updated successfully');
    });

    it('does not write when summarizeFn returns empty string', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const mockSummarizeFn = vi.fn().mockResolvedValue('');
      await updateMemoryFromConversation('conversation', mockSummarizeFn);

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('does not write when summarizeFn returns whitespace only', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const mockSummarizeFn = vi.fn().mockResolvedValue('   \n  ');
      await updateMemoryFromConversation('conversation', mockSummarizeFn);

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('handles missing memory file — starts from empty and still updates', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const mockSummarizeFn = vi.fn().mockResolvedValue('# Initialized memory');
      await updateMemoryFromConversation('User: I just moved to Taipei', mockSummarizeFn);

      expect(mockSummarizeFn).toHaveBeenCalledWith(
        expect.stringContaining('empty')
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('does not duplicate existing facts — prompt includes deduplication instruction', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('- Name: Alice\n- Location: Taipei');

      const mockSummarizeFn = vi.fn().mockResolvedValue('- Name: Alice\n- Location: Taipei');
      await updateMemoryFromConversation('conversation about cats', mockSummarizeFn);

      expect(mockSummarizeFn).toHaveBeenCalledWith(
        expect.stringContaining('Do NOT duplicate')
      );
    });
  });
});
