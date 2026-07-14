// Sandbox Sync — orchestrates full and incremental sync from Sandbox into the
// Wiki pipeline. Converts Sandbox assets → Knowledge Layer → Document Model → Import Service.

import fs from 'node:fs';
import path from 'node:path';
import { listAllAssets } from './assets.js';
import { fetchDetail } from './detail.js';
import type { Document, DocumentSummary, SyncResult } from '../types.js';
import type { ListParams } from '../types.js';
import { parseSandboxDetail, toEmbeddingMarkdown } from './knowledge/index.js';

/** File to persist last sync timestamp for incremental sync */
function lastSyncFile(): string {
  return path.join(process.cwd(), 'backend', 'data', '.sandbox_last_sync');
}

function readLastSync(): string | null {
  try {
    return fs.readFileSync(lastSyncFile(), 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

function writeLastSync(timestamp: string): void {
  const dir = path.dirname(lastSyncFile());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lastSyncFile(), timestamp, 'utf-8');
}

export async function listDocuments(params?: ListParams): Promise<DocumentSummary[]> {
  const { assets } = await listAllAssets(params);
  return assets.map((a) => ({
    id: a.id,
    title: a.title,
    type: a.type,
    updatedAt: a.updateTime || a.createTime || '',
    description: a.description,
    metadata: {
      projectId: a.projectId,
      status: a.status,
      author: a.author,
    },
  }));
}

export async function fetchDocument(id: string, type?: string): Promise<Document> {
  const { getDetail } = await import('./client.js');

  // If we know the type, fetch directly
  if (type) {
    const detail = await getDetail(type, id);
    return toDocument(id, detail);
  }

  // No type known — try all known types
  const knownTypes = ['operator', 'dot', 'dataset', 'post'];
  const errors: Error[] = [];

  for (const t of knownTypes) {
    try {
      const detail = await getDetail(t, id);
      return toDocument(id, detail);
    } catch (err: any) {
      errors.push(err);
    }
  }

  throw new Error(
    `Failed to fetch detail for asset "${id}" via all types: ${errors.map((e) => e.message).join('; ')}`,
  );
}

function toDocument(id: string, detail: any): Document {
  // Route through Knowledge Layer for normalization
  const knowledge = parseSandboxDetail(detail, detail.project?.projectTitle);
  // Generate clean embedding-optimized Markdown (no UUIDs, no raw IDs)
  const markdown = toEmbeddingMarkdown(knowledge);
  return {
    id,
    title: knowledge.title,
    type: detail.type || 'unknown',
    updatedAt: knowledge.updatedAt || '',
    content: markdown,
    attachments: knowledge.attachments,
    source: 'sandbox',
    tags: knowledge.tags,
    description: knowledge.abstract,
    author: knowledge.author,
    metadata: {
      projectId: detail.project?.projectId,
      projectTitle: detail.project?.projectTitle,
      knowledgeType: knowledge.type,
      unresolvedIds: knowledge.metadata.unresolvedIds,
    },
  };
}

export async function syncAll(
  params?: ListParams,
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();

  console.log('[Sandbox:Sync] Starting full sync...');
  const { assets } = await listAllAssets(params);

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    try {
      onProgress?.(i + 1, assets.length);

      // We track status but actual import into Wiki is handled by the caller
      // (connector orchestrator). Here we just validate the asset can be fetched.
      await fetchDetail(asset);
      created++;
    } catch (err: any) {
      errors.push(`[${asset.id}] ${err.message}`);
      skipped++;
    }
  }

  // Record sync timestamp
  const finishedAt = new Date().toISOString();
  writeLastSync(finishedAt);

  console.log(`[Sandbox:Sync] Complete: ${created} created, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

  return {
    connector: 'sandbox',
    total: assets.length,
    created,
    updated,
    skipped,
    errors,
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
  };
}

export async function syncIncremental(
  onProgress?: (current: number, total: number) => void,
): Promise<SyncResult> {
  const lastSync = readLastSync();
  if (!lastSync) {
    console.log('[Sandbox:Sync] No previous sync — running full sync');
    return syncAll(undefined, onProgress);
  }

  console.log(`[Sandbox:Sync] Incremental sync since: ${lastSync}`);
  return syncAll({ since: lastSync }, onProgress);
}

export function getLastSyncTime(): string | null {
  return readLastSync();
}
