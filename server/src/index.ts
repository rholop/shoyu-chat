import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRouter from './routes/auth';
import conversationsRouter from './routes/conversations';
import chatRouter from './routes/chat';
import suggestionsRouter from './routes/suggestions';
import filesRouter from './routes/files';
import projectsRouter from './routes/projects';
import searchRouter, { rebuildIndexInternal } from './routes/search';
import insightsRouter from './routes/insights';
import todosRouter, { calendarToken, verifyDownloadToken } from './routes/todos';
import loopsRouter from './routes/loops';
import { requireAuth } from './middleware/authMiddleware';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { scheduleWeeklyDigest, sendWeeklyDigest } from './jobs/weeklyDigest';
import { recoverSummaryTimers } from './services/summaryService';
import { SearchIndexService } from './services/searchIndexService';
import path from 'path';
import fs from 'fs';
import { dataDir, getConversationMeta } from './storage';
import * as todoService from './services/todoService';
import * as icsService from './services/icsService';

const REQUIRED_ENV = ['JWT_SECRET'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: false }));

app.use('/api/auth', authRouter);

app.get('/api/calendar/:token/subscribe.ics', async (req, res) => {
  const expectedToken = calendarToken(1);
  if (req.params.token !== expectedToken) {
    res.status(401).send('Unauthorized');
    return;
  }

  const todos = await todoService.getAllTodos();
  if (todos.length === 0) {
    res.status(404).send('No open todos');
    return;
  }

  const todosWithTitle: icsService.TodoWithTitle[] = await Promise.all(
    todos.map(async todo => {
      const convId = todo.conversationId.replace(/^conversation-/, '');
      const meta = getConversationMeta(convId);
      return { ...todo, conversationTitle: meta?.title ?? 'Untitled conversation' };
    })
  );

  const icsContent = icsService.generateIcs(todosWithTitle);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="shoyu-todos.ics"');
  res.send(icsContent);
});

// Short-lived token download endpoints (no cookie auth needed — token proves identity)
app.get('/api/download/:token/:expires/todos.ics', async (req, res) => {
  if (!verifyDownloadToken(req.params.token, req.params.expires)) {
    res.status(401).send('Unauthorized');
    return;
  }
  const todos = await todoService.getAllTodos();
  if (todos.length === 0) {
    res.status(404).send('No open todos');
    return;
  }
  const todosWithTitle: icsService.TodoWithTitle[] = await Promise.all(
    todos.map(async todo => {
      const convId = todo.conversationId.replace(/^conversation-/, '');
      const meta = getConversationMeta(convId);
      return { ...todo, conversationTitle: meta?.title ?? 'Untitled conversation' };
    })
  );
  const icsContent = icsService.generateIcs(todosWithTitle);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="shoyu-todos.ics"');
  res.send(icsContent);
});

app.get('/api/download/:token/:expires/todos/:conversationId/:todoId.ics', async (req, res) => {
  if (!verifyDownloadToken(req.params.token, req.params.expires)) {
    res.status(401).send('Unauthorized');
    return;
  }
  const { conversationId, todoId } = req.params;
  const todos = await todoService.getTodos(conversationId);
  const todo = todos.find(t => t.id === todoId);
  if (!todo) {
    res.status(404).send('Todo not found');
    return;
  }
  const meta = getConversationMeta(conversationId.replace(/^conversation-/, ''));
  const todoWithTitle: icsService.TodoWithTitle = {
    ...todo,
    conversationTitle: meta?.title ?? 'Untitled conversation'
  };
  const icsContent = icsService.generateIcs([todoWithTitle]);
  const safeName = todo.text.slice(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.ics"`);
  res.send(icsContent);
});

app.use('/api/conversations', requireAuth, conversationsRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/suggestions', requireAuth, suggestionsRouter);
app.use('/api/files', requireAuth, filesRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/search', requireAuth, searchRouter);
app.use('/api/insights', requireAuth, insightsRouter);
app.use('/api/todos', requireAuth, todosRouter);
app.use('/api/loops', requireAuth, loopsRouter);

app.post('/api/admin/digest/trigger', requireAuth, async (_req, res) => {
  await sendWeeklyDigest();
  res.json({ ok: true });
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  recoverSummaryTimers();
  scheduleWeeklyDigest();

  // Auto-seed search index from existing data if missing
  const indexPath = path.join(dataDir(), 'search-index.jsonl');
  if (!fs.existsSync(indexPath)) {
    logger.info('Search index missing — building from existing data...');
    rebuildIndexInternal().catch((err) =>
      logger.error('Failed to build initial search index:', err)
    );
  }
});
