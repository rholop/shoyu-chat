import fs from 'fs';
import path from 'path';
import os from 'os';
import { getISOWeekKey, getMonthKey, getWeekRangeLabel, getMonthLabel } from '../utils/dateHelpers';

const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../../../../data');

function chatsDir() {
  const d = path.join(DATA_DIR, 'chats');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function summariesDir() {
  const d = path.join(DATA_DIR, 'summaries');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function atomicWrite(filePath: string, content: string) {
  const tmp = path.join(os.tmpdir(), `shoyu-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

// ── Chat file ─────────────────────────────────────────────────────────────────

export interface ChatFileData {
  id: string;
  title: string;
  date: string;
  models: string[];
  summary: string;
  topics: string;
}

export function writeChatFile(data: ChatFileData) {
  const filename = `${data.date}-${data.id}.md`;
  const filePath = path.join(chatsDir(), filename);

  const content = `# ${data.title}
**Date:** ${data.date}
**Model(s):** ${data.models.join(', ')}

## Summary
${data.summary}

## Topics
${data.topics}

## Last Updated
${new Date().toISOString()}
`;
  atomicWrite(filePath, content);
  return filePath;
}

// ── Weekly summary ────────────────────────────────────────────────────────────

export interface WeeklyEntry {
  date: string;
  title: string;
  oneLiner: string;
}

export function upsertWeeklyEntry(entry: WeeklyEntry, weekKey?: string) {
  const key = weekKey ?? getISOWeekKey();
  const filePath = path.join(summariesDir(), `${key}.md`);

  const weekNum = key.split('-W')[1];
  const rangeLabel = getWeekRangeLabel();

  let existing = '';
  if (fs.existsSync(filePath)) {
    existing = fs.readFileSync(filePath, 'utf8');
  }

  const tableRow = `| ${entry.date} | ${entry.title} | ${entry.oneLiner} |`;

  if (!existing) {
    const header = `# Week ${weekNum} — ${rangeLabel}\n\n| Date | Conversation | Summary |\n|------|-------------|---------|`;
    atomicWrite(filePath, `${header}\n${tableRow}\n`);
  } else {
    // Append row before any trailing newline
    const trimmed = existing.trimEnd();
    atomicWrite(filePath, `${trimmed}\n${tableRow}\n`);
  }
}

export function readWeeklySummary(weekKey?: string): string {
  const key = weekKey ?? getISOWeekKey();
  const filePath = path.join(summariesDir(), `${key}.md`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

// ── Monthly summary ───────────────────────────────────────────────────────────

export interface MonthlyData {
  monthKey: string;
  overview: string;
  conversations: Array<{ title: string; oneLiner: string }>;
}

export function writeMonthlyFile(data: MonthlyData) {
  const filePath = path.join(summariesDir(), `${data.monthKey}.md`);
  const label = getMonthLabel(new Date(data.monthKey + '-01'));

  const convLines = data.conversations
    .map((c) => `- ${c.title} — ${c.oneLiner}`)
    .join('\n');

  const content = `# ${label}

## Overview
${data.overview}

## Conversations (${data.conversations.length} total)
${convLines}
`;
  atomicWrite(filePath, content);
}

export function readMonthlySummary(monthKey?: string): string {
  const key = monthKey ?? getMonthKey();
  const filePath = path.join(summariesDir(), `${key}.md`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}
