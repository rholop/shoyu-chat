/**
 * One-time migration from flat data structure to per-conversation directories.
 *
 * Usage:
 *   npx ts-node scripts/migrate-data-structure.ts [--dry-run] [--verify]
 *
 * --dry-run  Print what would happen, change nothing.
 * --verify   Check that every conversation-{id}/ has the required files.
 */

import fs from 'fs';
import path from 'path';

export interface MigrationReport {
  conversationsMigrated: number;
  projectsMigrated: number;
  filesMoved: number;
  chatsArchived: number;
  errors: string[];
}

export interface MigrationOptions {
  dryRun?: boolean;
  dataDir?: string;
}

function ensureDir(dirPath: string, dryRun: boolean) {
  if (!dryRun) fs.mkdirSync(dirPath, { recursive: true });
}

function copyFileOp(src: string, dest: string, dryRun: boolean) {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function moveFileOp(src: string, dest: string, dryRun: boolean) {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);
  }
}

// ── Verify mode ───────────────────────────────────────────────────────────────

export function verifyMigration(dataDir: string): { ok: number; bad: number; issues: string[] } {
  const base = dataDir;
  if (!fs.existsSync(base)) return { ok: 0, bad: 0, issues: [] };

  const dirs = fs.readdirSync(base).filter(
    (name) => name.startsWith('conversation-') && fs.statSync(path.join(base, name)).isDirectory(),
  );

  let ok = 0;
  let bad = 0;
  const issues: string[] = [];

  for (const dir of dirs) {
    const full = path.join(base, dir);
    const required = ['meta.json', 'conversation.ndjson'];
    const missing = required.filter((f) => !fs.existsSync(path.join(full, f)));
    const noUploads = !fs.existsSync(path.join(full, 'uploads'));
    const noDownloads = !fs.existsSync(path.join(full, 'downloads'));

    if (missing.length > 0 || noUploads || noDownloads) {
      const dirIssues = [
        ...missing.map((f) => `missing ${f}`),
        ...(noUploads ? ['missing uploads/'] : []),
        ...(noDownloads ? ['missing downloads/'] : []),
      ];
      issues.push(`${dir}: ${dirIssues.join(', ')}`);
      bad++;
    } else {
      ok++;
    }
  }

  return { ok, bad, issues };
}

// ── Migration ─────────────────────────────────────────────────────────────────

export async function runMigration(options: MigrationOptions = {}): Promise<MigrationReport> {
  const { dryRun = false, dataDir } = options;
  const base = dataDir ?? (process.env.DATA_DIR ?? path.join(__dirname, '../data'));

  const report: MigrationReport = {
    conversationsMigrated: 0,
    projectsMigrated: 0,
    filesMoved: 0,
    chatsArchived: 0,
    errors: [],
  };

  if (!fs.existsSync(base)) return report;

  // ── 1. Migrate conversations ────────────────────────────────────────────────

  const oldConversationsDir = path.join(base, 'conversations');
  if (fs.existsSync(oldConversationsDir)) {
    const files = fs.readdirSync(oldConversationsDir);
    const ndjsonFiles = files.filter((f) => f.endsWith('.ndjson'));

    for (const ndjsonFile of ndjsonFiles) {
      const rawId = ndjsonFile.slice(0, -7);
      const newDir = path.join(base, `conversation-${rawId}`);

      if (fs.existsSync(newDir) && fs.existsSync(path.join(newDir, 'conversation.ndjson'))) {
        continue; // already migrated — idempotent
      }

      try {
        ensureDir(path.join(newDir, 'uploads'), dryRun);
        ensureDir(path.join(newDir, 'downloads'), dryRun);

        copyFileOp(
          path.join(oldConversationsDir, ndjsonFile),
          path.join(newDir, 'conversation.ndjson'),
          dryRun,
        );

        const srcMeta = path.join(oldConversationsDir, `${rawId}.json`);
        const destMeta = path.join(newDir, 'meta.json');
        if (fs.existsSync(srcMeta)) {
          if (!dryRun) {
            const meta = JSON.parse(fs.readFileSync(srcMeta, 'utf8'));
            fs.writeFileSync(destMeta, JSON.stringify(meta, null, 2), 'utf8');
          }
        } else if (!dryRun) {
          const meta = { id: rawId, title: 'Imported Conversation', created_at: new Date().toISOString() };
          fs.writeFileSync(destMeta, JSON.stringify(meta, null, 2), 'utf8');
        }

        const oldFilesDir = path.join(oldConversationsDir, rawId);
        if (fs.existsSync(oldFilesDir) && fs.statSync(oldFilesDir).isDirectory()) {
          for (const f of fs.readdirSync(oldFilesDir)) {
            moveFileOp(
              path.join(oldFilesDir, f),
              path.join(newDir, 'uploads', f),
              dryRun,
            );
            report.filesMoved++;
          }
        }

        report.conversationsMigrated++;
      } catch (err) {
        report.errors.push(`Failed to migrate conversation ${rawId}: ${err}`);
      }
    }
  }

  // ── 2. Migrate projects ─────────────────────────────────────────────────────

  const oldProjectsDir = path.join(base, 'projects');
  if (fs.existsSync(oldProjectsDir)) {
    const projectJsonFiles = fs.readdirSync(oldProjectsDir).filter(
      (f) => f.endsWith('.json') && !f.includes('-context') && !f.includes('-summary'),
    );

    for (const jsonFile of projectJsonFiles) {
      const rawId = jsonFile.slice(0, -5);
      const newDir = path.join(base, `project-${rawId}`);

      if (fs.existsSync(newDir) && fs.existsSync(path.join(newDir, 'meta.json'))) {
        continue; // already migrated
      }

      try {
        ensureDir(newDir, dryRun);
        copyFileOp(path.join(oldProjectsDir, jsonFile), path.join(newDir, 'meta.json'), dryRun);

        const contextSrc = path.join(oldProjectsDir, `${rawId}-context.md`);
        if (fs.existsSync(contextSrc)) {
          copyFileOp(contextSrc, path.join(newDir, 'context.md'), dryRun);
        }

        const summarySrc = path.join(oldProjectsDir, `${rawId}-summary.md`);
        if (fs.existsSync(summarySrc)) {
          copyFileOp(summarySrc, path.join(newDir, 'summary.md'), dryRun);
        }

        report.projectsMigrated++;
      } catch (err) {
        report.errors.push(`Failed to migrate project ${rawId}: ${err}`);
      }
    }
  }

  // ── 3. Archive old chats/ markdown files ────────────────────────────────────

  const oldChatsDir = path.join(base, 'chats');
  if (fs.existsSync(oldChatsDir)) {
    const archiveDir = path.join(base, 'summaries', 'archive');
    ensureDir(archiveDir, dryRun);
    for (const f of fs.readdirSync(oldChatsDir).filter((f) => f.endsWith('.md'))) {
      moveFileOp(path.join(oldChatsDir, f), path.join(archiveDir, f), dryRun);
      report.chatsArchived++;
    }
  }

  return report;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');
  const dataDir = process.env.DATA_DIR ?? path.join(__dirname, '../data');

  if (verify) {
    const result = verifyMigration(dataDir);
    console.log(`Verify: ${result.ok} OK, ${result.bad} with issues`);
    if (result.issues.length) result.issues.forEach((i) => console.log(`  [BAD] ${i}`));
  } else {
    if (dryRun) console.log('=== Dry run — no changes will be made ===\n');
    runMigration({ dryRun, dataDir }).then((report) => {
      console.log('\n=== Migration Report ===');
      console.log(`  Conversations migrated : ${report.conversationsMigrated}`);
      console.log(`  Projects migrated      : ${report.projectsMigrated}`);
      console.log(`  Files moved to uploads : ${report.filesMoved}`);
      console.log(`  Chats archived         : ${report.chatsArchived}`);
      if (report.errors.length) {
        console.log(`\n  Errors (${report.errors.length}):`);
        report.errors.forEach((e) => console.log(`    - ${e}`));
      }
      if (!dryRun) {
        console.log('\nMigration complete. Old directories have NOT been deleted.');
        console.log('After verifying with --verify, remove them manually.');
      }
    });
  }
}
