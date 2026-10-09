// Legacy → knowledge-domain backfill dry run (P1-02).
//
// Read-only: prints the mapping plan for every legacy entry without writing a
// single row. Run `npm run kb:backfill` (requires a reachable database).
import { dryRunBackfill, DEFAULT_BACKFILL_KB } from '../backend/services/knowledge-backfill.service.js';

async function main(): Promise<void> {
  const report = await dryRunBackfill(DEFAULT_BACKFILL_KB);
  if (process.env.KB_BACKFILL_JSON === '1') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { kb, totalEntries, skippedEmpty, plannedDocuments, byEntryType, sample } = report;
  console.log(`[backfill] dry-run → KB "${kb.name}" (${kb.slug}, ${kb.visibility})`);
  console.log(`[backfill] legacy entries: ${totalEntries} (skipped empty/title-less: ${skippedEmpty})`);
  console.log(`[backfill] would create: ${plannedDocuments} documents, ${plannedDocuments} sources, ${plannedDocuments} revisions`);
  console.log(`[backfill] by entry_type: ${Object.entries(byEntryType).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`);
  console.log('[backfill] sample (first 3):');
  for (const p of sample) {
    console.log(`  - entry #${p.entryId} "${p.document.title.slice(0, 50)}" (${p.entryType}, ${p.visibility}) checksum=${p.revision.checksum.slice(0, 12)}…`);
  }
  console.log('[backfill] NO WRITES PERFORMED (dry-run).');
}

main().catch((err) => {
  console.error('[backfill] failed:', err.message);
  process.exit(1);
});
