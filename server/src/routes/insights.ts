import { Router } from 'express';
import * as insightsService from '../services/insightsService';
import { logger } from '../utils/logger';

const router = Router();

router.post('/similar', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    if (typeof message !== 'string' || typeof conversationId !== 'string') {
      return res.status(400).json({ error: 'message and conversationId are required' });
    }

    const matches = await insightsService.findSimilar(message, conversationId);
    res.json({ matches });
  } catch (err) {
    logger.error('POST /api/insights/similar failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
