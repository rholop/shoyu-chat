import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { summarizeNvidia, isNvidiaAvailable } from './nvidiaService';
import { summarizeGemini } from './geminiService';

const MAX_WORDS = 4000;

function memoryFilePath(): string {
  const dir = process.env.DATA_DIR ?? path.join(__dirname, '../../../data');
  return path.join(dir, 'user-memory.md');
}

function atomicWrite(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function enforceWordLimit(content: string): string {
  const words = content.trim().split(/\s+/);
  if (words.length <= MAX_WORDS) return content;
  logger.warn(`user-memory.md exceeds ${MAX_WORDS} words; truncating to limit`);
  return words.slice(0, MAX_WORDS).join(' ');
}

export function readMemory(): string | null {
  const p = memoryFilePath();
  if (!fs.existsSync(p)) {
    logger.warn('user-memory.md not found; continuing without user context');
    return null;
  }
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    logger.warn(`Failed to read user-memory.md: ${err}`);
    return null;
  }
}

export function writeMemory(content: string): void {
  atomicWrite(memoryFilePath(), enforceWordLimit(content));
}

export function getMemoryFilePath(): string {
  return memoryFilePath();
}

export async function updateMemoryFromConversation(
  conversationHistory: string
): Promise<void> {
  const existing = readMemory() ?? '';

  const prompt = `You are a personal memory manager. Update the user's long-term memory profile based on new conversation history.

EXISTING MEMORY:
${existing || '(empty — initialize using the template structure)'}

NEW CONVERSATION:
${conversationHistory}

RULES:
1. Identify new personal facts, completed milestones, or meaningful updates from the conversation.
2. Merge new information into the correct section of the existing memory.
3. Do NOT duplicate information already present.
4. Do NOT record transient chat topics, temporary tasks, or one-off questions.
5. Preserve the existing Markdown section structure exactly.
6. Keep the total output under ${MAX_WORDS} words.

Return the complete updated memory file in Markdown format. Do not include any preamble or explanation.`;

  let updated: string | undefined;

  // v4.0: Architect is NVIDIA Llama 3.1 405B (Fallback: Gemini 1.5 Pro)
  try {
    if (isNvidiaAvailable()) {
      updated = await summarizeNvidia(prompt, 'meta/llama-3.1-405b-instruct');
    } else {
      updated = await summarizeGemini(prompt);
    }
  } catch (err) {
    logger.warn(`Memory architect failed, trying fallback: ${err}`);
    try {
      updated = await summarizeGemini(prompt);
    } catch (fallbackErr) {
      logger.error(`Memory update failed permanently: ${fallbackErr}`);
    }
  }

  if (updated?.trim()) {
    writeMemory(updated.trim());
    logger.info('User memory updated successfully');
  }
}
