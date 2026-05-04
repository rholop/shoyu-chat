import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SearchIndexService, SearchRecord } from './searchIndexService';
import { dataDir } from '../storage';

vi.mock('../storage', () => ({
  dataDir: vi.fn(() => path.join(__dirname, '../../test-data-search')),
}));

describe('SearchIndexService', () => {
  const testDataDir = path.join(__dirname, '../../test-data-search');
  const originalEnv = process.env.ENABLE_SEARCH_INDEX_IN_TESTS;

  beforeAll(() => {
    process.env.ENABLE_SEARCH_INDEX_IN_TESTS = 'true';
  });

  afterAll(() => {
    process.env.ENABLE_SEARCH_INDEX_IN_TESTS = originalEnv;
  });
  const indexPath = path.join(testDataDir, 'search-index.jsonl');

  beforeEach(() => {
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    if (fs.existsSync(indexPath)) {
      fs.unlinkSync(indexPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  const sampleRecord: SearchRecord = {
    id: '1',
    type: 'conversation',
    title: 'Test Title',
    content: 'Test Content',
    snippet: 'Test...',
    sourcePath: 'data/conversation-1/conversation.ndjson',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should index a record asynchronously', async () => {
    SearchIndexService.indexRecord(sampleRecord);
    await SearchIndexService._waitForQueue();

    expect(fs.existsSync(indexPath)).toBe(true);
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(JSON.parse(content)).toEqual(sampleRecord);
  });

  it('should remove a record by id', async () => {
    fs.writeFileSync(indexPath, JSON.stringify(sampleRecord) + '\n');

    SearchIndexService.removeRecord('1');
    await SearchIndexService._waitForQueue();

    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content.trim()).toBe('');
  });

  it('should remove records by source prefix', async () => {
    const record2 = { ...sampleRecord, id: '2', sourcePath: 'data/other/file.txt' };
    fs.writeFileSync(indexPath, JSON.stringify(sampleRecord) + '\n' + JSON.stringify(record2) + '\n');

    SearchIndexService.removeRecordsBySourcePrefix('data/conversation-1');
    await SearchIndexService._waitForQueue();

    const records = await SearchIndexService.getAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe('2');
  });

  it('should rebuild the index', async () => {
    const records = [sampleRecord, { ...sampleRecord, id: '2' }];
    await SearchIndexService.rebuildIndex(records);

    const savedRecords = await SearchIndexService.getAllRecords();
    expect(savedRecords).toHaveLength(2);
    expect(savedRecords[0].id).toBe('1');
    expect(savedRecords[1].id).toBe('2');
  });
});
