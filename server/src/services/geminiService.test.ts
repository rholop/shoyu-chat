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

import {
  streamChatGemini,
  streamChatGeminiWithSearch,
  summarizeGemini,
  isGeminiAvailable,
} from './geminiService';
import { ChatMessage } from './groqService';

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

function makeStream(texts: string[], groundingMetadata?: Record<string, unknown>) {
  return {
    stream: (async function* () {
      for (const t of texts) yield { text: () => t };
    })(),
    response: Promise.resolve({
      candidates: [{ groundingMetadata }],
    }),
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
    const chunks = await collect(streamChatGemini(messages));
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('skips empty text chunks', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['Hi', '', ' there']));
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hey' }];
    const chunks = await collect(streamChatGemini(messages));
    expect(chunks).toEqual(['Hi', ' there']);
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

  it('does not request googleSearch tool', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['ok']));
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hi' }];
    await collect(streamChatGemini(messages));

    // getGenerativeModel should NOT have been called with googleSearch tool
    const callArgs = mockGetGenerativeModel.mock.calls[0];
    expect(JSON.stringify(callArgs)).not.toContain('googleSearch');
  });
});

describe('streamChatGeminiWithSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('requests the googleSearch tool when creating the model', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['Result']));
    await collect(streamChatGeminiWithSearch([{ role: 'user', content: 'news today' }]));

    const modelConfig = mockGetGenerativeModel.mock.calls.find(
      (call) => JSON.stringify(call).includes('googleSearch'),
    );
    expect(modelConfig).toBeDefined();
  });

  it('yields text chunks from the stream', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['Search', ' result']));
    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'latest AI news' }]),
    );
    // String tokens only (no grounding chunk since metadata is undefined)
    expect(chunks).toEqual(['Search', ' result']);
  });

  it('yields GroundingChunk when grounding metadata has web queries', async () => {
    const metadata = {
      webSearchQueries: ['AI news 2026'],
      groundingChunks: [
        { web: { uri: 'https://example.com/ai', title: 'AI News' } },
      ],
    };
    mockSendMessageStream.mockResolvedValue(makeStream(['Answer'], metadata));

    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'AI news' }]),
    );

    const texts = chunks.filter((c) => typeof c === 'string');
    const notes = chunks.filter(
      (c) => typeof c === 'object' && c !== null && 'groundingNotes' in (c as object),
    );

    expect(texts).toEqual(['Answer']);
    expect(notes).toHaveLength(1);
    const note = notes[0] as { groundingNotes: string };
    expect(note.groundingNotes).toContain('Queries: AI news 2026');
    expect(note.groundingNotes).toContain('https://example.com/ai');
  });

  it('yields GroundingChunk with only queries when no web sources', async () => {
    const metadata = {
      webSearchQueries: ['typescript tips'],
    };
    mockSendMessageStream.mockResolvedValue(makeStream(['Tips here'], metadata));

    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'ts tips' }]),
    );

    const notes = chunks.filter(
      (c) => typeof c === 'object' && c !== null && 'groundingNotes' in (c as object),
    );
    expect(notes).toHaveLength(1);
    const note = notes[0] as { groundingNotes: string };
    expect(note.groundingNotes).toContain('Queries: typescript tips');
  });

  it('does not yield GroundingChunk when grounding metadata is absent', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['Plain answer']));

    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'hello' }]),
    );

    const notes = chunks.filter(
      (c) => typeof c === 'object' && c !== null && 'groundingNotes' in (c as object),
    );
    expect(notes).toHaveLength(0);
    expect(chunks).toEqual(['Plain answer']);
  });

  it('does not yield GroundingChunk when metadata has no queries or sources', async () => {
    const metadata = { someOtherField: true };
    mockSendMessageStream.mockResolvedValue(makeStream(['ok'], metadata));

    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'hi' }]),
    );

    const notes = chunks.filter(
      (c) => typeof c === 'object' && c !== null && 'groundingNotes' in (c as object),
    );
    expect(notes).toHaveLength(0);
  });

  it('handles response.candidates being undefined gracefully', async () => {
    mockSendMessageStream.mockResolvedValue({
      stream: (async function* () { yield { text: () => 'ok' }; })(),
      response: Promise.resolve({ candidates: undefined }),
    });

    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'test' }]),
    );
    expect(chunks).toEqual(['ok']);
  });

  it('strips leading non-user messages from history', async () => {
    mockSendMessageStream.mockResolvedValue(makeStream(['ok']));
    const messages: ChatMessage[] = [
      { role: 'system', content: 'System note' },
      { role: 'user', content: 'Hello' },
    ];
    await collect(streamChatGeminiWithSearch(messages));

    // startChat history should only contain the system message (mapped to user)
    // but not include the final user message (sent separately)
    const chatHistory = mockStartChat.mock.calls[0][0].history as Array<{ role: string }>;
    // System message maps to 'user'; no 'assistant' before it → history is empty after filter
    expect(chatHistory.every((h) => h.role !== 'model')).toBe(true);
  });
});

describe('summarizeGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('returns generated text', async () => {
    const result = await summarizeGemini('summarize this');
    expect(result).toBe('summary text');
  });
});
