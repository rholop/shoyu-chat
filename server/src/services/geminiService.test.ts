import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSendMessageStream, mockStartChat, mockGetGenerativeModel } = vi.hoisted(() => {
  const mockSendMessageStream = vi.fn();
  const mockStartChat = vi.fn(() => ({ sendMessageStream: mockSendMessageStream }));
  const mockGetGenerativeModel = vi.fn(() => ({
    startChat: mockStartChat,
    generateContent: vi.fn().mockResolvedValue({ response: { text: () => 'summary text' } }),
  }));
  return { mockSendMessageStream, mockStartChat, mockGetGenerativeModel };
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

import { streamChatGemini, summarizeGemini, isGeminiAvailable } from './geminiService';
import { ChatMessage } from './groqService';

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

function makeStream(texts: string[]) {
  return {
    stream: (async function* () {
      for (const t of texts) yield { text: () => t };
    })(),
  };
}

describe('isGeminiAvailable', () => {
  it('returns true when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    expect(isGeminiAvailable()).toBe(true);
    delete process.env.GEMINI_API_KEY;
  });

  it('returns false when GEMINI_API_KEY is absent', () => {
    delete process.env.GEMINI_API_KEY;
    expect(isGeminiAvailable()).toBe(false);
  });
});

describe('streamChatGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('yields text chunks from the stream', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['Hello', ' world']));
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    const tokens = await collect(streamChatGemini(messages));
    expect(tokens).toEqual(['Hello', ' world']);
  });

  it('skips empty text chunks', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['Hi', '', ' there']));
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hey' }];
    const tokens = await collect(streamChatGemini(messages));
    expect(tokens).toEqual(['Hi', ' there']);
  });

  it('passes image inlineData for user messages with images', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['ok']));
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: 'what is this?',
        images: [{ mimeType: 'image/png', base64: 'abc123', filename: 'test.png' }],
      },
    ];
    await collect(streamChatGemini(messages));
    const callArgs = mockSendMessageStream.mock.calls[0][0];
    const parts = callArgs as Array<unknown>;
    expect(parts).toContainEqual({ inlineData: { mimeType: 'image/png', data: 'abc123' } });
  });
});

describe('summarizeGemini', () => {
  it('returns generated text', async () => {
    const result = await summarizeGemini('summarize this');
    expect(result).toBe('summary text');
  });
});
