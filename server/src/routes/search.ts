import { Router, Request, Response } from 'express';
import { SearchService } from '../services/searchService';
import { SearchIndexService, SearchRecord } from '../services/searchIndexService';
import { SearchExtractor } from '../services/searchExtractor';
import {
  listConversations,
  getMessages,
  listProjects,
  getProjectContext,
  getProjectSummary,
  conversationFilesDir,
  conversationDownloadsDir,
  dataDir
} from '../storage';
import fs from 'fs';
import path from 'path';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { q, projectId, types, includeInternal, limit } = req.query;

    if (!q || typeof q !== 'string') {
      return res.json({ query: q, results: [] });
    }

    const options = {
      projectId: projectId as string,
      types: typeof types === 'string' ? types.split(',') : undefined,
      includeInternal: includeInternal === 'true',
      limit: limit ? parseInt(limit as string, 10) : 20,
    };

    const results = await SearchService.search(q, options);
    res.json({ query: q, results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error during search' });
  }
});

router.post('/rebuild', async (req: Request, res: Response) => {
  try {
    await rebuildIndexInternal();
    res.json({ message: 'Index rebuild complete' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rebuild index' });
  }
});

export async function rebuildIndexInternal() {
  console.log('Rebuilding search index...');
  const allRecords: SearchRecord[] = [];

  // 1. Projects
  const projects = listProjects();
  for (const project of projects) {
    const context = getProjectContext(project.id);
    const summary = getProjectSummary(project.id);
    allRecords.push(...SearchExtractor.fromProject(project, context, summary));
  }

  // 2. Conversations and Files
  const conversations = listConversations();
  for (const conv of conversations) {
    const messages = getMessages(conv.id);
    messages.forEach((msg, i) => {
      allRecords.push(...SearchExtractor.fromMessage(conv.id, conv.title, conv.projectId || undefined, undefined, msg, i));
    });

    // Uploads
    const uploadsDir = conversationFilesDir(conv.id);
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        if (fs.statSync(filePath).isFile()) {
           allRecords.push(...await SearchExtractor.fromFile('upload', filePath, conv.id, conv.title, conv.projectId || undefined));
        }
      }
    }

    // Downloads
    const downloadsDir = conversationDownloadsDir(conv.id);
    if (fs.existsSync(downloadsDir)) {
      const files = fs.readdirSync(downloadsDir);
      for (const file of files) {
        if (file === '.versions') continue;
        const filePath = path.join(downloadsDir, file);
        if (fs.statSync(filePath).isFile()) {
           allRecords.push(...await SearchExtractor.fromFile('download', filePath, conv.id, conv.title, conv.projectId || undefined));
        }
      }
    }
  }

  // 3. Summaries (Weekly/Monthly)
  const dDir = dataDir();
  const summaryFiles = fs.readdirSync(dDir).filter(f => f.startsWith('summary-') && f.endsWith('.md'));
  for (const file of summaryFiles) {
    const filePath = path.join(dDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    allRecords.push(...SearchExtractor.fromSummary(filePath, content));
  }

  await SearchIndexService.rebuildIndex(allRecords);
  console.log(`Index rebuild complete. Indexed ${allRecords.length} records.`);
}

export default router;
