// Migration helper: upload legacy local documents (backend/data/{reports,zaozhi,
// laiguanxue}) to MinIO and record object metadata in wiki_files.
// Entry association is read from analysis-output/entry-file-audit.json and only
// high-confidence matches are used. Source files are never deleted; re-running
// is idempotent by content SHA-256 + extension.
//
// Usage:
//   npm run storage:migrate -- --dry-run   (scan + stats only)
//   npm run storage:migrate                 (real migration)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../backend/db/connection.js';
import { entries, wikiFiles } from '../backend/db/schema.js';
import { fileRepository } from '../backend/repositories/file.repository.js';
import { objectStorageService } from '../backend/services/object-storage.service.js';
import {
  buildConfirmedEntryMap,
  dryRun,
  migrateFiles,
  type LocalFileInfo,
  type MigrationDeps,
} from '../backend/services/file-migration.service.js';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../backend/data');
const AUDIT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../analysis-output/entry-file-audit.json');
const DIRS = ['reports', 'zaozhi', 'laiguanxue'];

const SUPPORTED = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.md', '.txt', '.csv', '.html', '.htm',
  '.json', '.xml', '.yaml', '.yml', '.log',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);

function collectFiles(): string[] {
  const results: string[] = [];
  for (const dir of DIRS) {
    const root = path.join(DATA_DIR, dir);
    if (!fs.existsSync(root)) continue;
    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) results.push(full);
      }
    };
    walk(root);
  }
  return results.sort();
}

function sha256Of(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function buildFileInfo(filePath: string): LocalFileInfo {
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  return {
    filePath,
    relPath: path.relative(DATA_DIR, filePath).replace(/\\/g, '/'),
    fileName,
    ext: path.extname(fileName).toLowerCase(),
    size: stat.size,
    sha256: sha256Of(filePath),
  };
}

function loadConfirmedEntryMap(): Map<string, number[]> {
  if (!fs.existsSync(AUDIT_PATH)) {
    console.error(
      `Missing audit report: ${AUDIT_PATH}\nRun "npx tsx scripts/audit-entry-files.mts" first.`,
    );
    process.exit(1);
  }
  const audit = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
  return buildConfirmedEntryMap(audit);
}

const confirmedEntryMap = loadConfirmedEntryMap();

async function findEntryIds(_fileName: string, relPath: string): Promise<number[]> {
  const candidates = confirmedEntryMap.get(relPath) ?? [];
  if (candidates.length === 0) return [];

  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(and(inArray(entries.id, candidates), isNull(entries.deletedAt)));
  return rows.map((r) => r.id).sort((a, b) => a - b);
}

async function findExistingWikiFile(entryId: number, fileName: string) {
  const rows = await db
    .select({ id: wikiFiles.id })
    .from(wikiFiles)
    .where(and(eq(wikiFiles.entryId, entryId), eq(wikiFiles.originalFilename, fileName)))
    .limit(1);
  return rows[0] ?? null;
}

const deps: MigrationDeps = {
  bucket: objectStorageService.bucket,
  objectStorage: objectStorageService,
  readFile: (filePath) => fs.readFileSync(filePath),
  findEntryIds,
  findExistingWikiFile,
  createWikiFile: (input) =>
    fileRepository.create({
      name: input.name,
      size: input.size,
      type: input.type,
      entryId: input.entryId,
      usageType: 'document',
      storagePath: input.storagePath,
      objectKey: input.objectKey,
      objectBucket: input.objectBucket,
      sha256: input.sha256,
      contentType: input.contentType,
    }),
  updateWikiFile: (id, meta) => fileRepository.updateStorageMeta(id, meta),
};

const isDryRun =
  process.argv.includes('--dry-run') ||
  process.env.STORAGE_MIGRATE_DRY_RUN === '1' ||
  process.env.npm_config_dry_run === 'true';

if (!isDryRun && !objectStorageService.isConfigured()) {
  console.error(
    'Object storage is not configured. Set MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY and MINIO_BUCKET.',
  );
  process.exit(1);
}

const files = collectFiles().map(buildFileInfo);

if (isDryRun) {
  const report = await dryRun(files, deps);
  console.log(JSON.stringify({ dryRun: true, ...report }, null, 2));
} else {
  const report = await migrateFiles(files, deps);
  const review = report.items
    .filter((item) => item.reason === 'no_high_confidence_entry')
    .map((item) => ({ filePath: item.filePath, reason: item.reason }));
  console.log(
    JSON.stringify(
      {
        success: report.success,
        skipped: report.skipped,
        failed: report.failed,
        review,
        items: report.items,
      },
      null,
      2,
    ),
  );
}
