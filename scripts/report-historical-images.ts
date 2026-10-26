// Historical image report (P1-B). READ-ONLY: counts only, no migration, no
// backfill, no writes, and never prints image bytes or document body content.
//
// It reports:
//   - files:        image files under DATA_DIR/images
//   - trusted:      rows in document_images (verifiable provenance)
//   - verifiable:   files with a trusted ownership row
//   - unverifiable: files with no trusted ownership row (pending re-parse)
//   - references:   how many distinct /api/images/<name> URLs appear in each
//                   editable surface (documents.content, document_elements,
//                   entries.content). These are UNVERIFIED and must NOT be used
//                   to establish ownership.
//
// Run: tsx scripts/report-historical-images.ts
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from '../backend/config.js';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.tiff']);
const IMG_REF_RE = /\/api\/images\/([A-Za-z0-9][A-Za-z0-9._-]*)/g;

function imageFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

function distinctRefs(text: string): Set<string> {
  const refs = new Set<string>();
  for (const m of text.matchAll(IMG_REF_RE)) refs.add(m[1]);
  return refs;
}

async function main() {
  const imagesDir = path.join(config.dataDir, 'images');
  const files = imageFiles(imagesDir);

  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
  try {
    const trusted = await pool.query('SELECT image_name FROM document_images');
    const trustedSet = new Set(trusted.rows.map((r: { image_name: string }) => r.image_name));

    const docContent = await pool.query('SELECT content FROM documents WHERE deleted_at IS NULL');
    const docRefs = new Set<string>();
    for (const r of docContent.rows) for (const n of distinctRefs(r.content ?? '')) docRefs.add(n);

    const elements = await pool.query(
      "SELECT content::text AS c FROM document_elements WHERE element_type = 'image'",
    );
    const elementRefs = new Set<string>();
    for (const r of elements.rows) for (const n of distinctRefs(r.c ?? '')) elementRefs.add(n);

    const entries = await pool.query('SELECT content FROM entries WHERE deleted_at IS NULL');
    const entryRefs = new Set<string>();
    for (const r of entries.rows) for (const n of distinctRefs(r.content ?? '')) entryRefs.add(n);

    const verifiable = files.filter((f) => trustedSet.has(f));
    const unverifiable = files.filter((f) => !trustedSet.has(f));

    const report = {
      generatedAt: new Date().toISOString(),
      imagesDirectory: imagesDir,
      filesOnDisk: files.length,
      trustedOwnershipRows: trusted.rows.length,
      verifiableImages: verifiable.length,
      unverifiableImages: unverifiable.length,
      editableReferenceCounts: {
        documentsContent: docRefs.size,
        documentElements: elementRefs.size,
        legacyEntriesContent: entryRefs.size,
      },
      note:
        'Reference counts are UNVERIFIED and must not be used to grant image access. ' +
        'Unverifiable images are inaccessible via /api/images until their owning document is re-parsed ' +
        '(the parse pipeline registers provenance in document_images).',
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('report-historical-images failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
