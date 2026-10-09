// P1-01 — Knowledge domain schema + forward migration.
//
// Guards the two things that matter for a forward-only migration: (1) the four
// new tables are declared in the Drizzle schema, and (2) the 0008 SQL file only
// ever CREATEs those tables and their FKs/indexes — it must never DROP or ALTER
// the existing legacy tables, so the backfill adapter (P1-02) has a stable base.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  knowledgeBases,
  sources,
  documents,
  documentRevisions,
} from '../../backend/db/schema.js';

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../backend/db/migrations',
);

describe('P1-01 knowledge domain schema', () => {
  it('declares the four knowledge-domain tables', () => {
    // Drizzle table objects expose their resolved name in Symbol-for-name.
    const names = [knowledgeBases, sources, documents, documentRevisions].map(
      (t) => t[Symbol.for('drizzle:Name')],
    );
    expect(names).toEqual(['knowledge_bases', 'sources', 'documents', 'document_revisions']);
  });

  it('documents links back to a legacy entry (backfill bridge)', () => {
    // The entryId column is how legacy `entries` are mapped without an in-place
    // migration. It is nullable: a brand-new KB document need not have one.
    expect(documents.entryId).toBeDefined();
  });
});

describe('P1-01 forward migration 0008', () => {
  const sql = readFileSync(path.join(migrationsDir, '0008_add_knowledge_domain.sql'), 'utf-8');

  it('creates exactly the four new tables', () => {
    const created = [...sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(
      ['document_revisions', 'documents', 'knowledge_bases', 'sources'].sort(),
    );
  });

  it('never drops or alters a legacy table', () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"(entries|users|categories|tags|vectors|document_chunks|wiki_files)"/i);
  });

  it('is split into executable statements by the custom runner', () => {
    // backend/app.ts runMigrations() splits on this marker; the file must use it.
    expect(sql).toContain('--> statement-breakpoint');
  });
});
