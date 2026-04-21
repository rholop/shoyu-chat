import { create } from 'zustand';
import { Message, SSEEvent } from '../types';

interface ChatState {
  activeConversationId: number | null;
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  streamError: string | null;

  setActiveConversation: (id: number | null) => void;
  setMessages: (messages: Message[]) => void;
  appendToken: (token: string) => void;
  finalizeStream: (event: Extract<SSEEvent, { type: 'done' }>, model: string) => void;
  setStreamError: (msg: string) => void;
  resetStream: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeConversationId: null,
  messages: [],
  streamingContent: '',
  isStreaming: false,
  streamError: null,

  setActiveConversation: (id) => set({ activeConversationId: id, messages: [], streamingContent: '', isStreaming: false, streamError: null }),

  setMessages: (messages) => set({ messages }),

  appendToken: (token) => set({ streamingContent: get().streamingContent + token, isStreaming: true }),

  finalizeStream: (event, model) => {
    const { streamingContent, messages } = get();
    const newMessage: Message = {
      id: event.messageId,
      conversation_id: event.conversationId,
      role: 'assistant',
      content: streamingContent,
      model_used: model,
      created_at: new Date().toISOString(),
    };
    set({ messages: [...messages, newMessage], streamingContent: '', isStreaming: false, streamError: null });
  },

  setStreamError: (msg) => set({ streamError: msg, isStreaming: false, streamingContent: '' }),

  resetStream: () => set({ streamingContent: '', isStreaming: false, streamError: null }),
}));
