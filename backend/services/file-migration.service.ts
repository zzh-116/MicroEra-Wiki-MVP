// File migration service: uploads legacy local documents to MinIO and records
// the object metadata in wiki_files. Idempotent by content SHA-256 + extension;
// source files are never deleted. Pure logic with injected deps for testability.

export interface LocalFileInfo {
  filePath: string;
  relPath: string;
  fileName: string;
  ext: string;
  size: number;
  sha256: string;
}

export const HIGH_CONFIDENCE_THRESHOLD = 0.85;

export interface AuditFileMatch {
  relPath: string;
  method: string;
  confidence: number;
}

export interface AuditForwardEntry {
  entry_id: number;
  matched_files?: AuditFileMatch[];
}

export interface AuditSoftDeletedEntry {
  entry_id: number;
}

export interface AuditReport {
  forward?: AuditForwardEntry[];
  soft_deleted_entries?: AuditSoftDeletedEntry[];
}

export interface WikiFileInput {
  entryId: number;
  name: string;
  size: number;
  type: string;
  storagePath: string;
  objectKey: string;
  objectBucket: string;
  sha256: string;
  contentType: string;
}

export interface MigrationDeps {
  bucket: string;
  objectStorage: {
    isConfigured(): boolean;
    putObject(key: string, data: Buffer, size: number, contentType?: string): Promise<unknown>;
    headObject(key: string): Promise<unknown>;
  };
  readFile(filePath: string): Buffer;
  findEntryIds(fileName: string, relPath: string): Promise<number[]>;
  findExistingWikiFile(entryId: number, fileName: string): Promise<{ id: number } | null>;
  createWikiFile(input: WikiFileInput): Promise<{ id: number }>;
  updateWikiFile(
    id: number,
    meta: { objectKey: string; objectBucket: string; sha256: string; contentType: string },
  ): Promise<unknown>;
}

export interface DryRunReport {
  fileCount: number;
  totalSize: number;
  byDir: Record<string, { count: number; size: number }>;
  alreadyExistsObjectCount: number;
  toUploadCount: number;
  noEntryCount: number;
  wikiFilesLinkedCount: number;
}

export type MigrationItemStatus = 'success' | 'skipped' | 'failed';

export interface MigrationItem {
  filePath: string;
  status: MigrationItemStatus;
  reason?: string;
  objectKey?: string;
  entryIds?: number[];
  wikiFileIds?: number[];
}

export interface MigrationReport {
  success: number;
  skipped: number;
  failed: number;
  items: MigrationItem[];
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.log': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export function objectKeyFor(sha256: string, ext: string): string {
  return `documents/${sha256}${ext}`;
}

export function contentTypeForFile(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return CONTENT_TYPE_MAP[ext] || 'application/octet-stream';
}

/** Build relPath -> live entry ids from the read-only audit report. */
export function buildConfirmedEntryMap(audit: AuditReport): Map<string, number[]> {
  const softDeleted = new Set((audit.soft_deleted_entries ?? []).map((e) => e.entry_id));
  const byRelPath = new Map<string, number[]>();

  for (const entry of audit.forward ?? []) {
    if (softDeleted.has(entry.entry_id)) continue;
    for (const match of entry.matched_files ?? []) {
      if (match.confidence < HIGH_CONFIDENCE_THRESHOLD) continue;
      const ids = byRelPath.get(match.relPath) ?? [];
      if (!ids.includes(entry.entry_id)) ids.push(entry.entry_id);
      byRelPath.set(match.relPath, ids);
    }
  }

  for (const ids of byRelPath.values()) ids.sort((a, b) => a - b);
  return byRelPath;
}

function dirOf(relPath: string): string {
  const parts = relPath.split(/[\\/]/);
  return parts[0] || '(root)';
}

export async function dryRun(files: LocalFileInfo[], deps: MigrationDeps): Promise<DryRunReport> {
  const byDir = new Map<string, { count: number; size: number }>();
  const uniqueKeys = new Set<string>();
  let totalSize = 0;
  let noEntryCount = 0;
  let wikiFilesLinkedCount = 0;

  for (const file of files) {
    totalSize += file.size;
    const dir = dirOf(file.relPath);
    const stat = byDir.get(dir) || { count: 0, size: 0 };
    stat.count += 1;
    stat.size += file.size;
    byDir.set(dir, stat);

    const entryIds = await deps.findEntryIds(file.fileName, file.relPath);
    if (entryIds.length === 0) {
      noEntryCount += 1;
      continue;
    }
    for (const entryId of entryIds) {
      const existing = await deps.findExistingWikiFile(entryId, file.fileName);
      if (existing) wikiFilesLinkedCount += 1;
    }
    uniqueKeys.add(objectKeyFor(file.sha256, file.ext));
  }

  let alreadyExistsObjectCount = 0;
  if (deps.objectStorage.isConfigured()) {
    for (const key of uniqueKeys) {
      try {
        await deps.objectStorage.headObject(key);
        alreadyExistsObjectCount += 1;
      } catch {
        // object does not exist yet
      }
    }
  }

  return {
    fileCount: files.length,
    totalSize,
    byDir: Object.fromEntries(byDir),
    alreadyExistsObjectCount,
    toUploadCount: Math.max(0, uniqueKeys.size - alreadyExistsObjectCount),
    noEntryCount,
    wikiFilesLinkedCount,
  };
}

export async function migrateFiles(files: LocalFileInfo[], deps: MigrationDeps): Promise<MigrationReport> {
  const processedKeys = new Set<string>(); // object keys already confirmed in this run
  const items: MigrationItem[] = [];
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const item: MigrationItem = { filePath: file.filePath, status: 'failed' };
    try {
      const entryIds = await deps.findEntryIds(file.fileName, file.relPath);
      if (entryIds.length === 0) {
        item.status = 'skipped';
        item.reason = 'no_high_confidence_entry';
        skipped += 1;
        items.push(item);
        continue;
      }
      item.entryIds = entryIds;

      const key = objectKeyFor(file.sha256, file.ext);
      const contentType = contentTypeForFile(file.fileName);
      const reusedKey = processedKeys.has(key);

      if (reusedKey) {
        item.objectKey = key;
        item.reason = 'reused_object';
      } else {
        let exists = false;
        try {
          await deps.objectStorage.headObject(key);
          exists = true;
        } catch {
          exists = false;
        }
        if (!exists) {
          const data = deps.readFile(file.filePath);
          await deps.objectStorage.putObject(key, data, data.length, contentType);
        }
        try {
          await deps.objectStorage.headObject(key);
        } catch (err) {
          throw new Error(`headObject verification failed: ${(err as Error).message}`);
        }
        processedKeys.add(key);
        item.objectKey = key;
        item.reason = exists ? 'object_already_exists' : undefined;
      }

      const wikiFileIds: number[] = [];
      for (const entryId of entryIds) {
        const existing = await deps.findExistingWikiFile(entryId, file.fileName);
        if (existing) {
          await deps.updateWikiFile(existing.id, {
            objectKey: item.objectKey!,
            objectBucket: deps.bucket,
            sha256: file.sha256,
            contentType,
          });
          wikiFileIds.push(existing.id);
        } else {
          const created = await deps.createWikiFile({
            entryId,
            name: file.fileName,
            size: file.size,
            type: contentType,
            storagePath: file.filePath,
            objectKey: item.objectKey!,
            objectBucket: deps.bucket,
            sha256: file.sha256,
            contentType,
          });
          wikiFileIds.push(created.id);
        }
      }
      item.wikiFileIds = wikiFileIds;

      item.status = 'success';
      success += 1;
    } catch (err) {
      item.reason = (err as Error).message;
      failed += 1;
    }
    items.push(item);
  }

  return { success, skipped, failed, items };
}
