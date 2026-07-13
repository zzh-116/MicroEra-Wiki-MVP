// Cleanup: delete ALL entries that are NOT the new product-type Sandbox imports
import 'dotenv/config';
import { db } from './backend/db/connection.js';
import { entries, documentChunks, vectors, entryTags } from './backend/db/schema.js';
import { eq, and, not } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function main() {
  const allEntries = await db.select({
    id: entries.id,
    title: entries.title,
    entry_type: entries.entryType,
    summary: entries.summary,
    created_at: entries.createdAt,
  }).from(entries);

  // Find latest sync batch: entries whose summary starts with "Imported from sandbox" AND title is NOT an ObjectId (new ones have display titles)
  // Actually, simpler: keep only the most recently created batch of product entries
  // The new sync batch all have created_at within seconds of each other
  // Strategy: find all product-type entries grouped by creation time window

  console.log(`Total entries: ${allEntries.length}`);

  const productEntries = allEntries.filter(e => e.entry_type === 'product');
  console.log(`Product entries: ${productEntries.length}`);

  // Sort by created_at descending
  const sorted = [...productEntries].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (sorted.length === 0) {
    console.log('No product entries found.');
    return;
  }

  // The latest batch should all have creation times within a few seconds of each other
  // Find the latest creation time
  const latestTime = new Date(sorted[0].created_at).getTime();
  const BATCH_WINDOW_MS = 600_000; // 10 minutes — more than enough for a sync

  const latestBatch = sorted.filter(e =>
    Math.abs(new Date(e.created_at).getTime() - latestTime) < BATCH_WINDOW_MS
  );

  console.log(`Latest batch: ${latestBatch.length} entries`);
  console.log(`Sample titles from latest batch:`);
  for (const e of latestBatch.slice(0, 5)) {
    console.log(`  #${e.id}: ${e.title}`);
  }

  const latestIds = new Set(latestBatch.map(e => e.id));
  const toDelete = allEntries.filter(e => !latestIds.has(e.id));

  console.log(`\nDeleting ${toDelete.length} old entries...`);

  for (const entry of toDelete) {
    console.log(`  Deleting #${entry.id}: ${entry.title} (${entry.entry_type})`);
    try { await db.delete(entryTags).where(eq(entryTags.entryId, entry.id)); } catch {}
    try { await db.delete(vectors).where(eq(vectors.entryId, entry.id)); } catch {}
    try { await db.delete(documentChunks).where(eq(documentChunks.entryId, entry.id)); } catch {}
    await db.delete(entries).where(eq(entries.id, entry.id));
  }

  const remaining = await db.select({ count: sql<number>`count(*)` }).from(entries);
  console.log(`\nRemaining entries: ${remaining[0].count}`);
  console.log('Done!');
}

main().catch(console.error).finally(() => process.exit(0));
