import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRouter from './routes/auth';
import conversationsRouter from './routes/conversations';
import chatRouter from './routes/chat';
import filesRouter from './routes/files';
import projectsRouter from './routes/projects';
import searchRouter, { rebuildIndexInternal } from './routes/search';
import insightsRouter from './routes/insights';
import todosRouter from './routes/todos';
import { requireAuth } from './middleware/authMiddleware';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { scheduleWeeklyDigest, sendWeeklyDigest } from './jobs/weeklyDigest';
import { recoverSummaryTimers } from './services/summaryService';
import { SearchIndexService } from './services/searchIndexService';
import path from 'path';
import fs from 'fs';
import { dataDir } from './storage';

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
app.use('/api/conversations', requireAuth, conversationsRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/files', requireAuth, filesRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/search', requireAuth, searchRouter);
app.use('/api/insights', requireAuth, insightsRouter);
app.use('/api/todos', requireAuth, todosRouter);

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
