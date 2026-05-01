import {
  getProjectContext,
  getProjectSummary,
  writeProjectSummary,
  getProjectMeta,
  listConversations,
  getMessages,
} from '../storage';
import { summarize } from './aiRouter';
import { logger } from '../utils/logger';

export function getContext(projectId: string): string {
  return getProjectContext(projectId);
}

export async function regenerateProjectSummary(projectId: string): Promise<void> {
  const meta = getProjectMeta(projectId);
  if (!meta) {
    logger.warn(`Project ${projectId} not found, skipping summary`);
    return;
  }

  const projectConversations = listConversations().filter((c) => c.projectId === projectId);
  if (projectConversations.length === 0) return;

  const oneLiners: string[] = [];

  for (const conv of projectConversations) {
    const messages = getMessages(conv.id);
    if (messages.length === 0) continue;

    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    try {
      const oneLiner = await summarize(
        `Summarize this conversation in a single sentence focused on what the user was trying to accomplish or figure out. Start with a verb. Be specific. Do not describe the conversation itself. Describe the goal.\n\nConversation:\n${transcript}`,
      );
      oneLiners.push(`- ${conv.title}: ${oneLiner}`);
    } catch (err) {
      logger.error(`Failed to summarize conversation ${conv.id} for project ${projectId}:`, err);
    }
  }

  if (oneLiners.length === 0) return;

  const prompt = `Given these conversation summaries from a project called "${meta.name}":
${oneLiners.join('\n')}

Write a 3-5 sentence summary of:
1. What this project is working toward
2. What has been accomplished so far
3. What problems or questions have come up repeatedly
Write in second person ("You are building...").`;

  const summary = await summarize(prompt);
  writeProjectSummary(projectId, summary);
  logger.info(`Project summary updated for ${projectId}`);
}

export function readProjectSummary(projectId: string): string {
  return getProjectSummary(projectId);
}
