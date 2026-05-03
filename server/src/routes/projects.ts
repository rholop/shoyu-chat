import { Router } from 'express';
import { z } from 'zod';
import {
  listProjects,
  listConversations,
  getProjectMeta,
  createProject,
  updateProject,
  deleteProject,
  getProjectContext,
  writeProjectContext,
  getProjectSummary,
  listConversationsByProject,
  assignConversationProject,
} from '../storage';
import { getProjectDownloads } from '../services/fileService';

const router = Router();

router.get('/', (_req, res) => {
  const projects = listProjects();
  const allConversations = listConversations();

  const withCounts = projects.map((p) => ({
    ...p,
    conversationCount: allConversations.filter((c) => c.projectId === p.id).length,
  }));

  res.json(withCounts);
});

router.post('/', (req, res) => {
  const parsed = z
    .object({ name: z.string().min(1).max(200), description: z.string().max(2000).default('') })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  const id = createProject(parsed.data.name, parsed.data.description);
  res.status(201).json({ id });
});

router.get('/:id', (req, res) => {
  const meta = getProjectMeta(req.params.id);
  if (!meta) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const contextDoc = getProjectContext(req.params.id);
  const summary = getProjectSummary(req.params.id);
  const conversations = listConversationsByProject(req.params.id);
  res.json({ ...meta, contextDoc, summary, conversations });
});

router.patch('/:id', (req, res) => {
  const parsed = z
    .object({ name: z.string().min(1).max(200).optional(), description: z.string().max(2000).optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  const ok = updateProject(req.params.id, parsed.data);
  if (!ok) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const meta = getProjectMeta(id);
  if (!meta) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const conversations = listConversationsByProject(id);
  for (const conv of conversations) {
    assignConversationProject(conv.id, null);
  }

  deleteProject(id);
  res.json({ ok: true });
});

router.get('/:id/context', (req, res) => {
  if (!getProjectMeta(req.params.id)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ content: getProjectContext(req.params.id) });
});

router.put('/:id/context', (req, res) => {
  const parsed = z.object({ content: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  if (!getProjectMeta(req.params.id)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  writeProjectContext(req.params.id, parsed.data.content);
  res.json({ ok: true });
});

router.get('/:id/downloads', async (req, res) => {
  const { id } = req.params;
  if (!getProjectMeta(id)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const downloads = await getProjectDownloads(id);
  res.json(downloads);
});

export default router;
