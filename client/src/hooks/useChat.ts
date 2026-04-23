import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversation } from '../api/conversations';
import { sendMessage } from '../api/chat';
import { useChatStore } from '../store/chatStore';
import { Message } from '../types';

export function useChat(conversationId: string | null) {
  const queryClient = useQueryClient();
  const { appendToken, finalizeStream, setStreamError, resetStream, setMessages } = useChatStore();

  const query = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => getConversation(conversationId!),
    enabled: conversationId !== null,
    staleTime: 10 * 1000,
  });

  const messages = query.data?.messages ?? [];

  const send = useCallback(
    async (content: string, optimisticUserMessage: Message) => {
      if (!conversationId) return;

      setMessages([...messages, optimisticUserMessage]);
      resetStream();

      try {
        for await (const event of sendMessage(conversationId, content)) {
          if (event.type === 'token') {
            appendToken(event.content);
          } else if (event.type === 'done') {
            finalizeStream(event, event.model);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
          } else if (event.type === 'error') {
            setStreamError(event.message);
          }
        }
      } catch (err) {
        setStreamError(err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [conversationId, messages, appendToken, finalizeStream, setStreamError, resetStream, setMessages, queryClient]
  );

  return {
    messages,
    conversation: query.data,
    isLoading: query.isLoading,
    send,
  };
}
