import cron from 'node-cron';
import * as todoService from '../services/todoService';
import { logger } from '../utils/logger';

export async function runTodoMaintenance(): Promise<void> {
  try {
    const woken = await todoService.wakeSnoozedTodos();
    if (woken > 0) {
      logger.info(`todoMaintenance: woke ${woken} snoozed todo(s)`);
    }
  } catch (err) {
    logger.error('todoMaintenance: wakeSnoozedTodos failed:', err);
  }
}

export function scheduleTodoMaintenance() {
  // Daily at 12:05 AM
  cron.schedule(
    '5 0 * * *',
    () => {
      runTodoMaintenance();
    },
    { timezone: process.env.TZ ?? 'America/New_York' }
  );
  logger.info('Todo maintenance cron scheduled');
}
