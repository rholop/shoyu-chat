#!/usr/bin/env tsx
/**
 * seed-memory.ts
 *
 * Initializes data/user-memory.md from one of two sources:
 *   1. seed-data.json  — a git-ignored JSON file at the project root (preferred for automation)
 *   2. Interactive prompts — falls back to readline when the JSON file is absent
 *
 * Usage:
 *   npx tsx scripts/seed-memory.ts
 *
 * seed-data.json shape (all fields optional):
 * {
 *   "name": "Alice",
 *   "location": "Taipei, Taiwan",
 *   "timezone": "Asia/Taipei",
 *   "languages": "English (native), Mandarin (intermediate)",
 *   "background": "Software engineer turned indie hacker",
 *   "interests": "Cycling, specialty coffee, distributed systems",
 *   "communicationStyle": "Direct, prefers bullet points",
 *   "relocationOrigin": "San Francisco, USA",
 *   "relocationDestination": "Taipei, Taiwan",
 *   "relocationStatus": "Completed",
 *   "relocationPriorities": "ARC visa, central district, <$1500/mo rent",
 *   "relocationTimeline": "Moved 2025-03",
 *   "financeSituation": "Freelance consulting, stable income",
 *   "financeGoals": "6-month emergency fund, index fund investing",
 *   "financeCurrency": "Earning in USD, spending in TWD",
 *   "currentRole": "Freelance Full-Stack Engineer",
 *   "stack": "TypeScript, React, Node.js, PostgreSQL",
 *   "careerGoals": "Launch a SaaS product by end of 2026",
 *   "activeProjects": "shoyu-chat — personal AI orchestrator",
 *   "milestones": [
 *     "2025-03-01 — Relocated to Taipei",
 *     "2025-06-15 — Launched shoyu-chat v1"
 *   ],
 *   "notes": ["Prefers metric units", "Always provide TypeScript examples"]
 * }
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ?? path.join(PROJECT_ROOT, 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'user-memory.md');
const SEED_JSON = path.join(PROJECT_ROOT, 'seed-data.json');

interface SeedData {
  name?: string;
  location?: string;
  timezone?: string;
  languages?: string;
  background?: string;
  interests?: string;
  communicationStyle?: string;
  relocationOrigin?: string;
  relocationDestination?: string;
  relocationStatus?: string;
  relocationPriorities?: string;
  relocationTimeline?: string;
  financeSituation?: string;
  financeGoals?: string;
  financeCurrency?: string;
  currentRole?: string;
  stack?: string;
  careerGoals?: string;
  activeProjects?: string;
  milestones?: string[];
  notes?: string[];
}

function buildMemoryMarkdown(d: SeedData): string {
  const today = new Date().toISOString().slice(0, 10);

  const milestones =
    d.milestones && d.milestones.length > 0
      ? d.milestones.map((m) => `- ${m}`).join('\n')
      : `- ${today} — Memory initialized`;

  const notes =
    d.notes && d.notes.length > 0
      ? d.notes.map((n) => `- ${n}`).join('\n')
      : '- [Add any recurring preferences or facts here]';

  return `# User Memory Profile

> Auto-managed by shoyu-chat. Do not commit this file.
> Seeded: ${today}

---

## Identity

- **Name:** ${d.name ?? '[Not set]'}
- **Location:** ${d.location ?? '[Not set]'}
- **Timezone:** ${d.timezone ?? '[Not set]'}
- **Languages:** ${d.languages ?? '[Not set]'}

---

## Personal

- **Background:** ${d.background ?? '[Not set]'}
- **Interests:** ${d.interests ?? '[Not set]'}
- **Communication style:** ${d.communicationStyle ?? '[Not set]'}

---

## Relocation

- **Origin:** ${d.relocationOrigin ?? '[Not set]'}
- **Destination:** ${d.relocationDestination ?? '[Not set]'}
- **Status:** ${d.relocationStatus ?? '[Not set]'}
- **Key priorities:** ${d.relocationPriorities ?? '[Not set]'}
- **Timeline:** ${d.relocationTimeline ?? '[Not set]'}

---

## Finances

- **General situation:** ${d.financeSituation ?? '[Not set]'}
- **Goals:** ${d.financeGoals ?? '[Not set]'}
- **Currency context:** ${d.financeCurrency ?? '[Not set]'}

---

## Career

- **Current role:** ${d.currentRole ?? '[Not set]'}
- **Stack / domain:** ${d.stack ?? '[Not set]'}
- **Goals:** ${d.careerGoals ?? '[Not set]'}
- **Active projects:** ${d.activeProjects ?? '[Not set]'}

---

## Timeline & Milestones

${milestones}

---

## Preferences & Notes

${notes}
`;
}

async function promptUser(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function interactiveSeed(): Promise<SeedData> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\nNo seed-data.json found. Enter your details (press Enter to skip any field):\n');

  const ask = (q: string) => promptUser(rl, q);

  const data: SeedData = {
    name: await ask('Full name: '),
    location: await ask('Current location (city, country): '),
    timezone: await ask('Timezone (e.g. Asia/Taipei): '),
    languages: await ask('Languages (e.g. English native, Mandarin intermediate): '),
    background: await ask('Personal background (1-2 sentences): '),
    interests: await ask('Key interests/hobbies: '),
    communicationStyle: await ask('Communication style preference: '),
    relocationOrigin: await ask('Relocation — origin city: '),
    relocationDestination: await ask('Relocation — destination city: '),
    relocationStatus: await ask('Relocation — status (Planning/In progress/Completed): '),
    relocationPriorities: await ask('Relocation — key priorities: '),
    relocationTimeline: await ask('Relocation — timeline: '),
    financeSituation: await ask('Finance — general situation: '),
    financeGoals: await ask('Finance — goals: '),
    financeCurrency: await ask('Finance — currency context: '),
    currentRole: await ask('Current role / title: '),
    stack: await ask('Tech stack / domain: '),
    careerGoals: await ask('Career goals: '),
    activeProjects: await ask('Active projects: '),
  };

  rl.close();
  return data;
}

async function main() {
  console.log('shoyu-chat — User Memory Seeder\n');

  let seedData: SeedData;

  if (fs.existsSync(SEED_JSON)) {
    console.log(`Loading seed data from ${SEED_JSON}...`);
    try {
      const raw = fs.readFileSync(SEED_JSON, 'utf8');
      seedData = JSON.parse(raw) as SeedData;
      console.log('Seed data loaded successfully.\n');
    } catch (err) {
      console.error(`Failed to parse seed-data.json: ${err}`);
      process.exit(1);
    }
  } else {
    seedData = await interactiveSeed();
  }

  // Validate the generated markdown has the expected sections
  const markdown = buildMemoryMarkdown(seedData);
  const requiredSections = ['## Identity', '## Personal', '## Relocation', '## Finances', '## Career', '## Timeline'];
  const missingSections = requiredSections.filter((s) => !markdown.includes(s));
  if (missingSections.length > 0) {
    console.error(`Generated markdown is missing sections: ${missingSections.join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (fs.existsSync(MEMORY_FILE)) {
    const backup = `${MEMORY_FILE}.backup-${Date.now()}`;
    fs.copyFileSync(MEMORY_FILE, backup);
    console.log(`Existing memory backed up to: ${backup}`);
  }

  fs.writeFileSync(MEMORY_FILE, markdown, 'utf8');
  console.log(`\nUser memory seeded at: ${MEMORY_FILE}`);
  console.log('Remember: this file is git-ignored and stays private.\n');
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
