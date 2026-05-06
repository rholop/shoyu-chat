import fs from 'fs';
import path from 'path';
import { SearchRecord } from './searchIndexService';
import { StoredMessage, ProjectMeta, dataDir } from '../storage';

const CHUNK_SIZE = 2000;
const MAX_FILE_SIZE_CHARS = 50000;
const TRUNCATION_MARKER = '[TRUNCATED]';

export class SearchExtractor {
  static chunkText(text: string, size: number = CHUNK_SIZE): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.slice(i, i + size));
    }
    return chunks;
  }

  static createSnippet(text: string, maxLength: number = 200): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  static async extractFileContent(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) return '';
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.pdf') {
        const pdf = require('pdf-parse');
        const dataBuffer = fs.readFileSync(filePath);
        let text = '';

        if (typeof pdf === 'function') {
          const data = await pdf(dataBuffer);
          text = data.text;
        } else if (typeof pdf.PDFParse === 'function') {
          const p = new pdf.PDFParse({ data: new Uint8Array(dataBuffer) });
          const res = await p.getText();
          text = res.text;
        } else if (typeof pdf.default === 'function') {
          const data = await pdf.default(dataBuffer);
          text = data.text;
        } else {
          throw new Error('pdf-parse extraction function not found');
        }

        return this.limitContent(text);
      }

      const isTextLike = [
        '.txt', '.md', '.json', '.csv', '.js', '.ts', '.tsx', '.jsx',
        '.html', '.css', '.yaml', '.yml', '.ndjson'
      ].includes(ext);

      if (isTextLike) {
        const content = fs.readFileSync(filePath, 'utf8');
        return this.limitContent(content);
      }
    } catch (error) {
      console.error(`Failed to extract content from ${filePath}:`, error);
    }

    return '';
  }

  private static limitContent(content: string): string {
    if (content.length > MAX_FILE_SIZE_CHARS) {
      return content.slice(0, MAX_FILE_SIZE_CHARS) + TRUNCATION_MARKER;
    }
    return content;
  }

  static fromMessage(
    conversationId: string,
    conversationTitle: string,
    projectId: string | undefined,
    projectName: string | undefined,
    message: StoredMessage,
    index: number
  ): SearchRecord[] {
    if (message.role === 'internal') return [];

    const chunks = this.chunkText(message.content);
    return chunks.map((chunk, chunkIndex) => ({
      id: `msg-${conversationId}-${index}-${chunkIndex}`,
      type: 'conversation',
      title: conversationTitle,
      content: chunk,
      snippet: this.createSnippet(chunk),
      conversationId,
      conversationTitle,
      projectId,
      projectName,
      sourcePath: `data/conversation-${conversationId}/conversation.ndjson`,
      createdAt: message.created_at,
      updatedAt: message.created_at,
      tokens: `${conversationTitle} ${chunk}`.toLowerCase(),
    }));
  }

  static fromProject(project: ProjectMeta, context: string, summary: string): SearchRecord[] {
    const records: SearchRecord[] = [];

    // Project Metadata
    records.push({
      id: `project-${project.id}-meta`,
      type: 'project',
      title: project.name,
      content: project.description,
      snippet: this.createSnippet(project.description),
      projectId: project.id,
      projectName: project.name,
      sourcePath: `data/project-${project.id}/meta.json`,
      createdAt: project.created_at,
      updatedAt: project.created_at,
      tokens: `${project.name} ${project.description}`.toLowerCase(),
    });

    // Context
    if (context) {
      const contextPath = path.join(dataDir(), `project-${project.id}`, 'context.md');
      const contextMtime = fs.existsSync(contextPath)
        ? fs.statSync(contextPath).mtime.toISOString()
        : project.created_at;
      this.chunkText(context).forEach((chunk, i) => {
        records.push({
          id: `project-${project.id}-context-${i}`,
          type: 'project',
          title: `${project.name} - Context`,
          content: chunk,
          snippet: this.createSnippet(chunk),
          projectId: project.id,
          projectName: project.name,
          sourcePath: `data/project-${project.id}/context.md`,
          createdAt: project.created_at,
          updatedAt: contextMtime,
          tokens: `${project.name} context ${chunk}`.toLowerCase(),
        });
      });
    }

    // Summary
    if (summary) {
      const summaryPath = path.join(dataDir(), `project-${project.id}`, 'summary.md');
      const summaryMtime = fs.existsSync(summaryPath)
        ? fs.statSync(summaryPath).mtime.toISOString()
        : project.created_at;
      this.chunkText(summary).forEach((chunk, i) => {
        records.push({
          id: `project-${project.id}-summary-${i}`,
          type: 'project',
          title: `${project.name} - Summary`,
          content: chunk,
          snippet: this.createSnippet(chunk),
          projectId: project.id,
          projectName: project.name,
          sourcePath: `data/project-${project.id}/summary.md`,
          createdAt: project.created_at,
          updatedAt: summaryMtime,
          tokens: `${project.name} summary ${chunk}`.toLowerCase(),
        });
      });
    }

    return records;
  }

  static fromSummary(filePath: string, content: string): SearchRecord[] {
    const fileName = path.basename(filePath);
    const title = fileName.replace('.md', '');
    const chunks = this.chunkText(content);
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

    return chunks.map((chunk, i) => ({
      id: `summary-${fileName}-${i}`,
      type: 'summary',
      title: `Summary: ${title}`,
      content: chunk,
      snippet: this.createSnippet(chunk),
      sourcePath: filePath,
      createdAt: stat?.birthtime.toISOString() ?? new Date().toISOString(),
      updatedAt: stat?.mtime.toISOString() ?? new Date().toISOString(),
      tokens: `summary ${title} ${chunk}`.toLowerCase(),
    }));
  }

  static async fromFile(
    type: 'upload' | 'download',
    filePath: string,
    conversationId: string,
    conversationTitle: string,
    projectId?: string,
    projectName?: string
  ): Promise<SearchRecord[]> {
    const fileName = path.basename(filePath);
    const content = await this.extractFileContent(filePath);
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

    // Store relative path so removeRecordsBySourcePrefix (which uses relative prefixes) works
    const relativePath = path.join('data', path.relative(dataDir(), filePath));

    const baseRecord: Omit<SearchRecord, 'id' | 'content' | 'snippet' | 'tokens'> = {
      type,
      title: fileName,
      conversationId,
      conversationTitle,
      projectId,
      projectName,
      sourcePath: relativePath,
      createdAt: stat?.birthtime.toISOString() ?? new Date().toISOString(),
      updatedAt: stat?.mtime.toISOString() ?? new Date().toISOString(),
    };

    if (!content) {
      return [{
        ...baseRecord,
        id: `${type}-${conversationId}-${fileName}`,
        content: '',
        snippet: `File: ${fileName}`,
        tokens: `${fileName}`.toLowerCase(),
      }];
    }

    const chunks = this.chunkText(content);
    return chunks.map((chunk, i) => ({
      ...baseRecord,
      id: `${type}-${conversationId}-${fileName}-${i}`,
      content: chunk,
      snippet: this.createSnippet(chunk),
      tokens: `${fileName} ${chunk}`.toLowerCase(),
    }));
  }
}
