// P1-02 — legacy entry backfill adapter (pure mapping + checksum invariants).
//
// These tests never touch the database: they exercise the compatibility adapter
// as a pure function so the mapping and its sha256 anchors are deterministic.
import { describe, it, expect } from 'vitest';
import {
  sha256,
  mapEntryToDocument,
  DEFAULT_BACKFILL_KB,
} from '../../backend/services/knowledge-backfill.service.js';
import type { Entry } from '../../backend/types.js';

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 42,
    title: 'MOF pore-aperture study',
    entry_type: 'academic_paper',
    summary: 'A study of MOF pore apertures.',
    content: 'The pore aperture is 8.5 Å.',
    visibility: 'internal',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    tags: ['mof'],
    ...overrides,
  };
}

describe('sha256', () => {
  it('is deterministic and matches a known digest', () => {
    const a = sha256('abc');
    const b = sha256('abc');
    expect(a).toBe(b);
    expect(a).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('differs for different content', () => {
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });
});

describe('mapEntryToDocument', () => {
  it('maps a legacy entry to source + document + revision', () => {
    const plan = mapEntryToDocument(entry());
    expect(plan).not.toBeNull();
    expect(plan!.entryId).toBe(42);
    expect(plan!.source.type).toBe('manual');
    expect(plan!.source.checksum).toBe(sha256('The pore aperture is 8.5 Å.'));
    expect(plan!.document.title).toBe('MOF pore-aperture study');
    expect(plan!.document.parseStatus).toBe('completed');
    expect(plan!.document.visibility).toBe('internal');
    expect(plan!.revision.revisionNo).toBe(1);
    expect(plan!.revision.checksum).toBe(plan!.source.checksum);
  });

  it('uses the file name for the source when present', () => {
    const plan = mapEntryToDocument(entry({ file_name: 'paper.pdf' }));
    expect(plan!.source.name).toBe('paper.pdf');
    expect(plan!.document.fileName).toBe('paper.pdf');
  });

  it('falls back to the title when there is no file name', () => {
    const plan = mapEntryToDocument(entry());
    expect(plan!.source.name).toBe('MOF pore-aperture study');
  });

  it('returns null for a placeholder with no title or content', () => {
    expect(mapEntryToDocument(entry({ title: '', content: '' }))).toBeNull();
  });

  it('honours the KB context', () => {
    const plan = mapEntryToDocument(entry(), {
      kbSlug: 'materials',
      kbName: 'Materials',
      visibility: 'public',
    });
    expect(plan).not.toBeNull();
    // The adapter preserves the entry's own visibility; the KB context defines
    // the collection, not a per-document override.
    expect(plan!.document.visibility).toBe('internal');
  });
});

describe('default KB context', () => {
  it('is internal by default so the adapter never widens visibility', () => {
    expect(DEFAULT_BACKFILL_KB.visibility).toBe('internal');
    expect(DEFAULT_BACKFILL_KB.kbSlug).toBe('legacy');
  });
});
