import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: vi.fn(function () { return { chat: { completions: { create: mockCreate } } }; }),
}));

import { streamChatNvidia, summarizeNvidia, isNvidiaAvailable } from './nvidiaService';

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const results: string[] = [];
  for await (const t of gen) results.push(t);
  return results;
}

function makeStream(tokens: string[]) {
  return (async function* () {
    for (const t of tokens) yield { choices: [{ delta: { content: t } }] };
  })();
}

describe('nvidiaService v4.0', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('streamChatNvidia calls specified model', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['hello']));
    await collect(streamChatNvidia([{ role: 'user', content: 'hi' }], 'custom-model'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });

  it('yields tokens from the stream', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['Hello', ' world']));
    const tokens = await collect(streamChatNvidia([{ role: 'user', content: 'hi' }], 'some-model'));
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('strips images from messages (text-only model)', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['ok']));
    await collect(
      streamChatNvidia([
        {
          role: 'user',
          content: 'Look at this',
          images: [{ mimeType: 'image/png', base64: 'abc', filename: 'img.png' }],
        },
      ], 'some-model'),
    );
    const calledMessages = mockCreate.mock.calls[0][0].messages;
    expect(calledMessages[0]).toEqual({ role: 'user', content: 'Look at this' });
  });

  it('summarizeNvidia calls specified model', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'summary' } }] });
    const result = await summarizeNvidia('summarize this', 'custom-model');
    expect(result).toBe('summary');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'custom-model' }),
      expect.anything(),
    );
  });

  it('passes 60s timeout to create()', async () => {
    mockCreate.mockResolvedValueOnce(makeStream(['ok']));
    await collect(streamChatNvidia([{ role: 'user', content: 'hi' }], 'model'));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('isNvidiaAvailable returns correctly', () => {
    process.env.NVIDIA_API_KEY = 'test';
    expect(isNvidiaAvailable()).toBe(true);
    delete process.env.NVIDIA_API_KEY;
    expect(isNvidiaAvailable()).toBe(false);
  });
});
