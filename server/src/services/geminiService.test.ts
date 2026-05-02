import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSendMessageStream, mockStartChat, mockGenerateContentStream, mockGetGenerativeModel } = vi.hoisted(() => {
  const mockSendMessageStream = vi.fn();
  const mockStartChat = vi.fn(() => ({ sendMessageStream: mockSendMessageStream }));
  const mockGenerateContentStream = vi.fn();
  const mockGetGenerativeModel = vi.fn(() => ({
    startChat: mockStartChat,
    generateContent: vi.fn().mockResolvedValue({ response: { text: () => 'summary text' } }),
    generateContentStream: mockGenerateContentStream,
  }));
  return { mockSendMessageStream, mockStartChat, mockGenerateContentStream, mockGetGenerativeModel };
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

  it('uses generateContentStream (not startChat) to satisfy googleSearch grounding requirement', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStream(['Result']));
    await collect(streamChatGeminiWithSearch([{ role: 'user', content: 'news today' }]));

    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
    expect(mockStartChat).not.toHaveBeenCalled();
  });

  it('passes the default google_search tool to getGenerativeModel', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStream(['Result']));
    await collect(streamChatGeminiWithSearch([{ role: 'user', content: 'news today' }]));

    const callArgs = mockGetGenerativeModel.mock.calls[0] as any;
    const modelConfig = callArgs[0] as { tools: unknown };
    expect(modelConfig.tools).toEqual([{ google_search: {} }]);
  });

  it('passes a custom searchTool when provided', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStream(['Result']));
    await collect(streamChatGeminiWithSearch(
      [{ role: 'user', content: 'news today' }],
      'gemini-1.5-pro',
      { custom_tool: {} },
    ));

    const callArgs = mockGetGenerativeModel.mock.calls[0] as any;
    const modelConfig = callArgs[0] as { tools: unknown };
    expect(modelConfig.tools).toEqual([{ custom_tool: {} }]);
  });

  it('passes full conversation history as contents', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStream(['ok']));
    const messages: ChatMessage[] = [
      { role: 'user', content: 'prior question' },
      { role: 'assistant', content: 'prior answer' },
      { role: 'user', content: 'search now' },
    ];
    await collect(streamChatGeminiWithSearch(messages));

    const callArg = mockGenerateContentStream.mock.calls[0][0] as { contents: unknown[] };
    expect(callArg.contents).toHaveLength(3);
  });

  it('excludes system messages from contents (passed as systemInstruction instead)', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStream(['ok']));
    const messages: ChatMessage[] = [
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'search for AI news' },
    ];
    await collect(streamChatGeminiWithSearch(messages));

    const callArg = mockGenerateContentStream.mock.calls[0][0] as { contents: Array<{ role: string }> };
    expect(callArg.contents.every((c) => c.role !== 'system')).toBe(true);
    expect(callArg.contents).toHaveLength(1);
  });

  it('yields text chunks from the stream', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStream(['Search', ' result']));
    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'latest AI news' }]),
    );
    expect(chunks).toEqual(['Search', ' result']);
  });

  it('yields GroundingChunk when grounding metadata has web queries', async () => {
    const metadata = {
      webSearchQueries: ['AI news 2026'],
      groundingChunks: [
        { web: { uri: 'https://example.com/ai', title: 'AI News' } },
      ],
    };
    mockGenerateContentStream.mockResolvedValue(makeStream(['Answer'], metadata));

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
    mockGenerateContentStream.mockResolvedValue(makeStream(['Tips here'], { webSearchQueries: ['typescript tips'] }));

    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'ts tips' }]),
    );

    const notes = chunks.filter(
      (c) => typeof c === 'object' && c !== null && 'groundingNotes' in (c as object),
    ) as Array<{ groundingNotes: string }>;
    expect(notes).toHaveLength(1);
    expect(notes[0].groundingNotes).toContain('Queries: typescript tips');
  });

  it('does not yield GroundingChunk when grounding metadata is absent', async () => {
    mockGenerateContentStream.mockResolvedValue(makeStream(['Plain answer']));

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
    mockGenerateContentStream.mockResolvedValue(makeStream(['ok'], { someOtherField: true }));

    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'hi' }]),
    );

    const notes = chunks.filter(
      (c) => typeof c === 'object' && c !== null && 'groundingNotes' in (c as object),
    );
    expect(notes).toHaveLength(0);
  });

  it('handles response.candidates being undefined gracefully', async () => {
    mockGenerateContentStream.mockResolvedValue({
      stream: (async function* () { yield { text: () => 'ok' }; })(),
      response: Promise.resolve({ candidates: undefined }),
    });

    const chunks = await collect(
      streamChatGeminiWithSearch([{ role: 'user', content: 'test' }]),
    );
    expect(chunks).toEqual(['ok']);
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
