import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chatStore';
import { Message, Intent } from '../types';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 1,
  conversation_id: 'conv-1',
  role: 'user',
  content: 'Hello',
  model_used: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: null,
      messages: [],
      streamingContent: '',
      isStreaming: false,
      streamError: null,
    });
  });

  describe('setActiveConversation', () => {
    it('sets the active conversation id', () => {
      useChatStore.getState().setActiveConversation('conv-123');
      expect(useChatStore.getState().activeConversationId).toBe('conv-123');
    });

    it('clears messages, streaming state, and error when switching conversations', () => {
      useChatStore.setState({
        messages: [makeMessage()],
        streamingContent: 'partial',
        isStreaming: true,
        streamError: 'oops',
      });
      useChatStore.getState().setActiveConversation('new-conv');
      const state = useChatStore.getState();
      expect(state.messages).toEqual([]);
      expect(state.streamingContent).toBe('');
      expect(state.isStreaming).toBe(false);
      expect(state.streamError).toBeNull();
    });

    it('accepts null to deselect conversation', () => {
      useChatStore.setState({ activeConversationId: 'conv-1' });
      useChatStore.getState().setActiveConversation(null);
      expect(useChatStore.getState().activeConversationId).toBeNull();
    });
  });

  describe('setMessages', () => {
    it('replaces the messages array', () => {
      const msgs = [makeMessage({ id: 1 }), makeMessage({ id: 2 })];
      useChatStore.getState().setMessages(msgs);
      expect(useChatStore.getState().messages).toEqual(msgs);
    });

    it('can set empty array to clear messages', () => {
      useChatStore.setState({ messages: [makeMessage()] });
      useChatStore.getState().setMessages([]);
      expect(useChatStore.getState().messages).toEqual([]);
    });
  });

  describe('appendToken', () => {
    it('appends token to streamingContent', () => {
      useChatStore.getState().appendToken('Hello');
      useChatStore.getState().appendToken(' world');
      expect(useChatStore.getState().streamingContent).toBe('Hello world');
    });

    it('sets isStreaming to true', () => {
      useChatStore.getState().appendToken('hi');
      expect(useChatStore.getState().isStreaming).toBe(true);
    });
  });

  describe('finalizeStream', () => {
    it('creates an assistant message from accumulated streamingContent', () => {
      useChatStore.setState({ streamingContent: 'The answer is 42.' });
      useChatStore.getState().finalizeStream(
        { type: 'done', model: 'groq-chat', conversationId: 'conv-1', intent: Intent.CODING },
        'groq-chat'
      );
      const { messages } = useChatStore.getState();
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('assistant');
      expect(messages[0].content).toBe('The answer is 42.');
      expect(messages[0].model_used).toBe('groq-chat');
      expect(messages[0].conversation_id).toBe('conv-1');
    });

    it('appends to existing messages', () => {
      const existing = makeMessage({ id: 10, role: 'user', content: 'hi' });
      useChatStore.setState({ messages: [existing], streamingContent: 'response' });
      useChatStore.getState().finalizeStream(
        { type: 'done', model: 'groq-chat', conversationId: 'conv-1', intent: Intent.CODING },
        'groq-chat'
      );
      expect(useChatStore.getState().messages).toHaveLength(2);
    });

    it('clears streaming state after finalizing', () => {
      useChatStore.setState({ streamingContent: 'done', isStreaming: true, streamError: 'old error' });
      useChatStore.getState().finalizeStream(
        { type: 'done', model: 'groq-chat', conversationId: 'conv-1', intent: Intent.CODING },
        'groq-chat'
      );
      const state = useChatStore.getState();
      expect(state.streamingContent).toBe('');
      expect(state.isStreaming).toBe(false);
      expect(state.streamError).toBeNull();
    });
  });

  describe('setStreamError', () => {
    it('sets the error message', () => {
      useChatStore.getState().setStreamError('Something went wrong');
      expect(useChatStore.getState().streamError).toBe('Something went wrong');
    });

    it('stops streaming and clears partial content', () => {
      useChatStore.setState({ isStreaming: true, streamingContent: 'partial...' });
      useChatStore.getState().setStreamError('error');
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().streamingContent).toBe('');
    });
  });

  describe('resetStream', () => {
    it('sets isStreaming to true and clears content and error', () => {
      useChatStore.setState({ streamingContent: 'old', isStreaming: false, streamError: 'prev error' });
      useChatStore.getState().resetStream();
      const state = useChatStore.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingContent).toBe('');
      expect(state.streamError).toBeNull();
    });
  });
});
