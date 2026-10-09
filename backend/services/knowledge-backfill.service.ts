// Legacy entry backfill (P1-02) — compatibility adapter + read-only dry run.
//
// The knowledge domain (KB/Source/Document/Revision) is the new model; the
// legacy `entries` table is the old one. This service maps an `Entry` into the
// new records WITHOUT mutating anything: the dry run reads the legacy table and
// returns a plan, so the migration can be reviewed and its checksums verified
// before any write (which happens in a later phase).
import { createHash } from 'node:crypto';
import { entryRepository } from '../repositories/entry.repository.js';
import type { Entry } from '../types.js';

/** sha256 of text content (utf-8) — the integrity anchor for revisions (K04). */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** One entry fully mapped to the three new records it would produce. */
export interface BackfillDocumentPlan {
  entryId: number;
  entryType: string;
  visibility: string;
  source: {
    type: 'manual';
    name: string;
    /** sha256 of the imported text — the "mapped source" checksum. */
    checksum: string;
  };
  document: {
    title: string;
    summary: string;
    content: string;
    visibility: string;
    fileName?: string;
    fileHash?: string;
    parseStatus: 'completed';
  };
  revision: {
    revisionNo: number;
    title: string;
    checksum: string;
  };
}

export interface BackfillReport {
  mode: 'dry-run';
  kb: { slug: string; name: string; visibility: string };
  totalEntries: number;
  skippedEmpty: number;
  plannedDocuments: number;
  plannedSources: number;
  plannedRevisions: number;
  byEntryType: Record<string, number>;
  sample: BackfillDocumentPlan[];
}

export interface BackfillKbContext {
  kbSlug: string;
  kbName: string;
  visibility: string;
}

export const DEFAULT_BACKFILL_KB: BackfillKbContext = {
  kbSlug: 'legacy',
  kbName: 'Legacy Entries',
  // Legacy corpus is overwhelmingly internal; the dry run defaults to internal
  // so the compatibility adapter never widens visibility by accident.
  visibility: 'internal',
};

/**
 * Compatibility adapter — pure mapping from a legacy entry to the new records.
 * No DB access; deterministic; safe to call repeatedly (same entry → same plan).
 */
export function mapEntryToDocument(entry: Entry, kb: BackfillKbContext = DEFAULT_BACKFILL_KB): BackfillDocumentPlan | null {
  // Entries with no content still get a source+document, but their revision
  // checksum is the hash of empty text. Truly empty AND title-less rows are
  // treated as un-mappable (e.g. a leftover placeholder).
  if (!entry.title?.trim() && !entry.content?.trim()) return null;

  const content = entry.content ?? '';
  const checksum = sha256(content);
  const fileName = entry.file_name || undefined;

  return {
    entryId: entry.id,
    entryType: entry.entry_type as string,
    visibility: entry.visibility,
    source: {
      type: 'manual',
      name: fileName || entry.title,
      checksum,
    },
    document: {
      title: entry.title,
      summary: entry.summary ?? '',
      content,
      visibility: entry.visibility,
      fileName,
      fileHash: undefined, // populated in P1-04 once object-storage artifacts exist
      parseStatus: 'completed', // legacy entries are already parsed + embedded
    },
    revision: {
      revisionNo: 1,
      title: entry.title,
      checksum,
    },
  };
}

/**
 * Read-only dry run: read every legacy entry, map it, and return a reviewable
 * plan. This function performs NO writes and cannot mutate the database.
 */
export async function dryRunBackfill(
  kb: BackfillKbContext = DEFAULT_BACKFILL_KB,
): Promise<BackfillReport> {
  const entries = await entryRepository.findAll({ isInternal: true });

  const byEntryType: Record<string, number> = {};
  const sample: BackfillDocumentPlan[] = [];
  let plannedDocuments = 0;
  let plannedSources = 0;
  let plannedRevisions = 0;
  let skippedEmpty = 0;

  for (const entry of entries) {
    const plan = mapEntryToDocument(entry, kb);
    if (!plan) {
      skippedEmpty++;
      continue;
    }
    byEntryType[plan.entryType] = (byEntryType[plan.entryType] ?? 0) + 1;
    plannedDocuments++;
    plannedSources++;
    plannedRevisions++;
    if (sample.length < 3) sample.push(plan);
  }

  return {
    mode: 'dry-run',
    kb: { slug: kb.kbSlug, name: kb.kbName, visibility: kb.visibility },
    totalEntries: entries.length,
    skippedEmpty,
    plannedDocuments,
    plannedSources,
    plannedRevisions,
    byEntryType,
    sample,
  };
}
