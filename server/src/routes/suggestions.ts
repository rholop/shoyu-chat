import { Router } from 'express';
import * as projectSuggestionService from '../services/projectSuggestionService';
import { logger } from '../utils/logger';
import { writeProjectContext, createProject, getProjectMeta } from '../storage';
import { SearchExtractor } from '../services/searchExtractor';
import { SearchIndexService } from '../services/searchIndexService';

const router = Router();

router.get('/projects', async (req, res) => {
  try {
    const suggestions = await projectSuggestionService.getProjectSuggestions();
    res.json({ suggestions });
  } catch (err) {
    logger.error('Failed to get project suggestions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/projects/create', async (req, res) => {
  const { topic } = req.body;
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'topic is required' });
  }

  try {
    const suggestions = await projectSuggestionService.getProjectSuggestions();
    const suggestion = suggestions.find((s) => s.topic.toLowerCase() === topic.toLowerCase());

    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found or already dismissed' });
    }

    const contextDoc = await projectSuggestionService.generateProjectContext(suggestion);

    const projectId = createProject(
      topic,
      `Project created from recurring interest in "${topic}" across ${suggestion.conversationCount} conversations.`
    );

    writeProjectContext(projectId, contextDoc);

    const meta = getProjectMeta(projectId);
    if (meta) {
      SearchExtractor.fromProject(meta, contextDoc, '').forEach((r) =>
        SearchIndexService.indexRecord(r)
      );
    }

    // After creating a project, we should dismiss the suggestion so it doesn't reappear
    await projectSuggestionService.dismissSuggestion(topic);

    res.json({ projectId });
  } catch (err) {
    logger.error('Failed to create project from suggestion:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/projects/dismiss', async (req, res) => {
  const { topic } = req.body;
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ error: 'topic is required' });
  }

  try {
    await projectSuggestionService.dismissSuggestion(topic);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to dismiss suggestion:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
