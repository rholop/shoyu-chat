import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRouter from './routes/auth';
import conversationsRouter from './routes/conversations';
import chatRouter from './routes/chat';
import { requireAuth } from './middleware/authMiddleware';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import { scheduleWeeklyDigest } from './jobs/weeklyDigest';
import { recoverSummaryTimers } from './services/summaryService';

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

app.post('/api/admin/digest/trigger', requireAuth, async (_req, res) => {
  const { sendWeeklyDigest } = await import('./jobs/weeklyDigest');
  await sendWeeklyDigest();
  res.json({ ok: true });
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  recoverSummaryTimers();
  scheduleWeeklyDigest();
});
