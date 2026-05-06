import { SimilarMatch } from '../types';

export async function findSimilar(
  message: string,
  conversationId: string
): Promise<{ matches: SimilarMatch[] }> {
  const res = await fetch('/api/insights/similar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message, conversationId }),
  });

  if (!res.ok) {
    return { matches: [] };
  }

  return res.json();
}
