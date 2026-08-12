// Graph Rebuild Service - batch-generates persisted semantic_related edges
// from pgvector similarity, then writes them into entry_relations.
import { entryRepository } from '../repositories/entry.repository.js';
import { relationRepository } from '../repositories/relation.repository.js';
import { searchService } from './search.service.js';

export const RELATION_SIMILARITY_THRESHOLD = 0.45;

// pgvector-derived scores stay in [-0.8, 1.2]; keyword-supplement scores are
// unbounded, so anything above 1.5 is NOT an embedding similarity and must not
// be persisted as an embedding relation.
const MAX_VECTOR_SCORE = 1.5;
const DEFAULT_TOP_K = 8;
const CONCURRENCY = 6;

interface RelationPair {
  sourceEntryId: number;
  targetEntryId: number;
  similarity: number;
}

export interface GraphRebuildResult {
  success: boolean;
  totalRelations: number;
  embeddingRelations: number;
  threshold: number;
  processedEntries: number;
  failedEntries: number;
  durationMs: number;
  generatedAt: string;
}

export async function rebuildSemanticRelations(options: {
  topK?: number;
  isInternal?: boolean;
} = {}): Promise<GraphRebuildResult> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const isInternal = options.isInternal ?? true;
  const started = Date.now();
  const entries = await entryRepository.findAll({ isInternal });
  const pairMap = new Map<string, RelationPair>();

  let processed = 0;
  let failed = 0;

  await mapWithConcurrency(entries, CONCURRENCY, async (entry) => {
    try {
      const results = await searchService.semanticSearch(entry.title, isInternal, topK);
      for (const result of results) {
        if (!result.entry || result.entry.id === entry.id) continue;
        const score = result.score;
        if (
          typeof score !== 'number'
          || score < RELATION_SIMILARITY_THRESHOLD
          || score > MAX_VECTOR_SCORE
        ) {
          continue;
        }
        addPair(pairMap, entry.id, result.entry.id, score);
      }
      processed++;
    } catch (err: any) {
      failed++;
      console.warn(`[GraphRebuild] semantic search failed for entry #${entry.id}: ${err.message}`);
    }
    if ((processed + failed) % 50 === 0) {
      console.log(`[GraphRebuild] progress: ${processed + failed}/${entries.length}`);
    }
  });

  const pairs = [...pairMap.values()];
  await relationRepository.replaceAll(pairs);

  const durationMs = Date.now() - started;
  console.log(
    `[GraphRebuild] done: ${pairs.length} semantic_related relations, ` +
    `${processed} processed / ${failed} failed entries, ${durationMs}ms`,
  );

  return {
    success: true,
    totalRelations: pairs.length,
    embeddingRelations: pairs.length,
    threshold: RELATION_SIMILARITY_THRESHOLD,
    processedEntries: processed,
    failedEntries: failed,
    durationMs,
    generatedAt: new Date().toISOString(),
  };
}

/** Normalize pairs so source < target and keep the best similarity per pair. */
function addPair(
  pairMap: Map<string, RelationPair>,
  a: number,
  b: number,
  similarity: number,
): void {
  if (a === b) return;
  const [sourceEntryId, targetEntryId] = a < b ? [a, b] : [b, a];
  const key = `${sourceEntryId}:${targetEntryId}`;
  const existing = pairMap.get(key);
  if (!existing || similarity > existing.similarity) {
    pairMap.set(key, { sourceEntryId, targetEntryId, similarity });
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      await fn(items[current]);
    }
  });
  await Promise.all(workers);
}
