import { Attachment, Provider, SSEEvent } from '../types';

export async function* sendMessage(
  conversationId: string,
  content: string,
  attachments: Attachment[] = [],
  provider: Provider = 'auto',
): AsyncGenerator<SSEEvent> {
  const res = await fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ conversationId, content, attachments, provider }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Chat request failed');
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.replace(/^data: /, '').trim();
      if (!line) continue;
      try {
        yield JSON.parse(line) as SSEEvent;
      } catch {
        // malformed chunk
      }
    }
  }
}
