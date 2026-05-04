import fs from 'fs';
import path from 'path';
import { dataDir } from '../storage';

export interface SearchRecord {
  id: string; // unique record ID
  type: 'conversation' | 'project' | 'summary' | 'upload' | 'download';
  title: string;
  content: string;
  snippet: string;
  conversationId?: string;
  conversationTitle?: string;
  projectId?: string;
  projectName?: string;
  sourcePath: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  tokens?: string; // normalized text for matching
}

const INDEX_FILE = 'search-index.jsonl';

export class SearchIndexService {
  private static queue: Promise<void> = Promise.resolve();

  private static get indexPath() {
    return path.join(dataDir(), INDEX_FILE);
  }

  private static enqueue(task: () => Promise<void>) {
    if (process.env.NODE_ENV === 'test' && !process.env.ENABLE_SEARCH_INDEX_IN_TESTS) {
      return;
    }
    this.queue = this.queue.then(() => task()).catch((err) => {
      console.error('SearchIndexService queue error:', err);
    });
  }

  static indexRecord(record: SearchRecord): void {
    this.enqueue(async () => {
      await this.removeRecordSync(record.id);
      fs.appendFileSync(this.indexPath, JSON.stringify(record) + '\n', 'utf8');
    });
  }

  static removeRecord(id: string): void {
    this.enqueue(async () => {
      await this.removeRecordSync(id);
    });
  }

  static removeRecordsBySourcePrefix(prefix: string): void {
    this.enqueue(async () => {
      if (!fs.existsSync(this.indexPath)) return;

      const tempPath = `${this.indexPath}.${process.pid}.tmp`;
      const readStream = fs.createReadStream(this.indexPath, 'utf8');
      const writeStream = fs.createWriteStream(tempPath, 'utf8');

      // Add boundary if prefix is a directory to avoid collisions (e.g. data/conversation-1 vs data/conversation-11)
      const boundaryPrefix = prefix.endsWith('/') || prefix.endsWith('.ndjson') || prefix.endsWith('.json') || prefix.endsWith('.md')
        ? prefix
        : prefix + '/';

      await new Promise<void>((resolve, reject) => {
        let remaining = '';
        readStream.on('data', (chunk) => {
          const lines = (remaining + chunk).split('\n');
          remaining = lines.pop() || '';
          for (const line of lines) {
            if (!line) continue;
            try {
              const record = JSON.parse(line);
              if (!record.sourcePath.startsWith(boundaryPrefix) && record.sourcePath !== prefix) {
                writeStream.write(line + '\n');
              }
            } catch (e) {}
          }
        });
        readStream.on('end', () => {
          if (remaining) {
            try {
              const record = JSON.parse(remaining);
              if (!record.sourcePath.startsWith(boundaryPrefix) && record.sourcePath !== prefix) {
                writeStream.write(remaining + '\n');
              }
            } catch (e) {}
          }
          writeStream.end();
        });
        writeStream.on('finish', () => {
          fs.renameSync(tempPath, this.indexPath);
          resolve();
        });
        readStream.on('error', reject);
        writeStream.on('error', reject);
      });
    });
  }

  private static async removeRecordSync(id: string): Promise<void> {
    if (!fs.existsSync(this.indexPath)) return;

    const tempPath = `${this.indexPath}.${process.pid}.tmp`;
    const readStream = fs.createReadStream(this.indexPath, 'utf8');
    const writeStream = fs.createWriteStream(tempPath, 'utf8');

    return new Promise((resolve, reject) => {
      let remaining = '';
      readStream.on('data', (chunk) => {
        const lines = (remaining + chunk).split('\n');
        remaining = lines.pop() || '';
        for (const line of lines) {
          if (!line) continue;
          try {
            const record = JSON.parse(line);
            if (record.id !== id) {
              writeStream.write(line + '\n');
            }
          } catch (e) {}
        }
      });

      readStream.on('end', () => {
        if (remaining) {
          try {
            const record = JSON.parse(remaining);
            if (record.id !== id) {
              writeStream.write(remaining + '\n');
            }
          } catch (e) {}
        }
        writeStream.end();
      });

      writeStream.on('finish', () => {
        fs.renameSync(tempPath, this.indexPath);
        resolve();
      });

      readStream.on('error', reject);
      writeStream.on('error', reject);
    });
  }

  static async getAllRecords(): Promise<SearchRecord[]> {
    // Wait for pending operations to complete before reading for search
    await this.queue;
    if (!fs.existsSync(this.indexPath)) return [];
    const content = fs.readFileSync(this.indexPath, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as SearchRecord];
        } catch {
          return [];
        }
      });
  }

  static async rebuildIndex(records: SearchRecord[]): Promise<void> {
    await this.queue;
    const tempPath = `${this.indexPath}.${process.pid}.rebuild.tmp`;
    const stream = fs.createWriteStream(tempPath, 'utf8');
    for (const record of records) {
      stream.write(JSON.stringify(record) + '\n');
    }
    await new Promise<void>((resolve) => stream.end(resolve));
    fs.renameSync(tempPath, this.indexPath);
  }

  // Helper for tests to wait for completion
  static async _waitForQueue(): Promise<void> {
    await this.queue;
  }
}
