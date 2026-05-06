import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversation } from '../api/conversations';
import { sendMessage } from '../api/chat';
import { findSimilar } from '../api/insights';
import { useChatStore } from '../store/chatStore';
import { Attachment, Message } from '../types';
import { detectIntent } from '../utils/detectIntent';

export function useChat(conversationId: string | null) {
  const queryClient = useQueryClient();
  const {
    appendToken,
    finalizeStream,
    setStreamError,
    resetStream,
    setMessages,
    setIntent,
    unlockIntent,
    selectedIntent,
    intentLocked,
    setNudges,
    firstMessageSent,
    markFirstMessageSent,
  } = useChatStore();

  const query = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => getConversation(conversationId!),
    enabled: conversationId !== null,
    staleTime: 10 * 1000,
  });

  const messages = query.data?.messages ?? [];

  const send = useCallback(
    async (content: string, optimisticUserMessage: Message, attachments: Attachment[] = []) => {
      if (!conversationId) return;

      // Auto-detect intent unless the user manually locked one for this send
      const hasImages = attachments.some((a) => a.mimeType.startsWith('image/'));
      const intent = intentLocked ? selectedIntent : detectIntent(content, hasImages);
      if (!intentLocked) setIntent(intent);

      setMessages([...messages, optimisticUserMessage]);
      resetStream();

      // Nudges on first message
      const isFirstMessage = messages.length === 0 && !firstMessageSent.has(conversationId);
      if (isFirstMessage) {
        markFirstMessageSent(conversationId);
        findSimilar(content, conversationId).then(({ matches }) => {
          if (matches.length > 0) {
            setNudges(matches);
          }
        }).catch(() => {
          // fail silently
        });
      }

      try {
        for await (const event of sendMessage(conversationId, content, attachments, intent)) {
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
      } finally {
        // Always unlock after a send so the next message auto-detects
        unlockIntent();
      }
    },
    [
      conversationId,
      messages,
      selectedIntent,
      intentLocked,
      appendToken,
      finalizeStream,
      setStreamError,
      resetStream,
      setMessages,
      setIntent,
      unlockIntent,
      setNudges,
      firstMessageSent,
      markFirstMessageSent,
      queryClient,
    ],
  );

  return {
    messages,
    conversation: query.data,
    isLoading: query.isLoading,
    send,
  };
}
