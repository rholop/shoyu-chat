import { create } from 'zustand';
import { Message, Intent, SSEEvent } from '../types';

interface ChatState {
  activeConversationId: string | null;
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  streamError: string | null;
  selectedIntent: Intent;
  /** true when the user manually clicked an intent button; resets after each send */
  intentLocked: boolean;

  setActiveConversation: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  appendToken: (token: string) => void;
  finalizeStream: (event: Extract<SSEEvent, { type: 'done' }>, model: string) => void;
  setStreamError: (msg: string) => void;
  resetStream: () => void;
  /** Manual override — locks intent for the next send only */
  setIntent: (intent: Intent) => void;
  /** Called internally after each send to re-enable auto-detection */
  unlockIntent: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeConversationId: null,
  messages: [],
  streamingContent: '',
  isStreaming: false,
  streamError: null,
  selectedIntent: Intent.CODING,
  intentLocked: false,

  setActiveConversation: (id) =>
    set({ activeConversationId: id, messages: [], streamingContent: '', isStreaming: false, streamError: null }),

  setMessages: (messages) => set({ messages }),

  appendToken: (token) => set({ streamingContent: get().streamingContent + token, isStreaming: true }),

  finalizeStream: (event, model) => {
    const { streamingContent, messages } = get();
    const newMessage: Message = {
      id: Date.now(),
      conversation_id: event.conversationId,
      role: 'assistant',
      content: streamingContent,
      model_used: model,
      created_at: new Date().toISOString(),
    };
    set({ messages: [...messages, newMessage], streamingContent: '', isStreaming: false, streamError: null });
  },

  setStreamError: (msg) => set({ streamError: msg, isStreaming: false, streamingContent: '' }),

  resetStream: () => set({ streamingContent: '', isStreaming: true, streamError: null }),

  setIntent: (intent) => set({ selectedIntent: intent, intentLocked: true }),

  unlockIntent: () => set({ intentLocked: false }),
}));
