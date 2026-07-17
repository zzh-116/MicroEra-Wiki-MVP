// Tests for ChunkService — 4 chunking strategies + estimateCount
import { describe, it, expect } from 'vitest';
import { ChunkService } from '../../backend/chunk/service';

const service = new ChunkService();

// ── estimateCount ──────────────────────────────────────────

describe('estimateCount', () => {
  it('returns ceiling of text length / (chunkSize - overlap)', () => {
    const count = service.estimateCount('A'.repeat(1000), { chunkSize: 400, overlap: 50 });
    expect(count).toBe(3); // ceil(1000 / 350) = 3
  });

  it('uses default config when none provided', () => {
    const count = service.estimateCount('A'.repeat(5000));
    expect(count).toBeGreaterThan(0);
  });
});

// ── fixed-size chunking ────────────────────────────────────

describe('fixed chunking', () => {
  it('returns single chunk when text is smaller than chunkSize', () => {
    const chunks = service.chunk('short text', 'd', { strategy: 'fixed', chunkSize: 500, overlap: 0, minChunkSize: 1 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('short text');
  });

  it('splits large text into multiple chunks', () => {
    const text = 'A'.repeat(250);
    const chunks = service.chunk(text, 'doc1', { strategy: 'fixed', chunkSize: 100, overlap: 0, minChunkSize: 10 });
    expect(chunks.length).toBe(3);
  });

  it('generates sequential chunk IDs', () => {
    const text = 'A'.repeat(250);
    const chunks = service.chunk(text, 'mydoc', { strategy: 'fixed', chunkSize: 100, overlap: 0, minChunkSize: 10 });
    expect(chunks[0].id).toBe('mydoc_chunk_0');
    expect(chunks[1].id).toBe('mydoc_chunk_1');
  });

  it('discards chunks shorter than minChunkSize', () => {
    const text = 'tiny';
    const chunks = service.chunk(text, 'd', { strategy: 'fixed', chunkSize: 500, overlap: 0, minChunkSize: 100 });
    expect(chunks).toHaveLength(0);
  });

  it('handles overlap without infinite loop when tail is below minChunkSize', () => {
    // Bug regression test: with overlap>0 and final sliver < minChunkSize,
    // offset previously got stuck at a position < text.length, looping forever.
    const text = 'ABCDEFGHIJ' + 'KLMNOPQRST' + 'UVWXYZabcd' + 'EFGHIJKLMN';
    const chunks = service.chunk(text, 'd', { strategy: 'fixed', chunkSize: 15, overlap: 5, minChunkSize: 5 });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // No more text left — the loop must have terminated
    const lastEnd = chunks[chunks.length - 1].endChar;
    expect(lastEnd).toBeLessThanOrEqual(text.length);
  });
});

// ── paragraph chunking ─────────────────────────────────────

describe('paragraph chunking', () => {
  it('merges short paragraphs together', () => {
    const text = 'A.\n\nB.\n\nC.\n\nD.';
    const chunks = service.chunk(text, 'd', { strategy: 'paragraph', chunkSize: 500, overlap: 0, minChunkSize: 5 });
    // All short paragraphs should merge into one chunk
    expect(chunks).toHaveLength(1);
  });

  it('handles single paragraph input', () => {
    const chunks = service.chunk('One paragraph only.', 'd', { strategy: 'paragraph', chunkSize: 500, overlap: 0, minChunkSize: 5 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.strategy).toBe('paragraph');
  });
});

// ── sentence chunking ──────────────────────────────────────

describe('sentence chunking', () => {
  it('handles single sentence', () => {
    const chunks = service.chunk('Only one sentence.', 'd', { strategy: 'sentence', chunkSize: 500, overlap: 0, minChunkSize: 5 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.strategy).toBe('sentence');
  });

  it('handles Chinese punctuation as boundaries', () => {
    const text = '第一句话。第二句话！第三句话？';
    const chunks = service.chunk(text, 'd', { strategy: 'sentence', chunkSize: 100, overlap: 0, minChunkSize: 1 });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('merges short sentences', () => {
    const text = 'A. B. C. D. E.';
    const chunks = service.chunk(text, 'd', { strategy: 'sentence', chunkSize: 500, overlap: 0, minChunkSize: 2 });
    expect(chunks).toHaveLength(1);
  });
});

// ── markdown-aware chunking ────────────────────────────────

describe('markdown chunking', () => {
  it('extracts heading into metadata', () => {
    const text = '## Introduction\nThis is the intro text.\n\n## Methods\nWe used these methods.';
    const chunks = service.chunk(text, 'd', { strategy: 'markdown', chunkSize: 500, overlap: 0, minChunkSize: 10 });
    expect(chunks.length).toBe(2);
    expect(chunks[0].metadata.heading).toBe('Introduction');
    expect(chunks[1].metadata.heading).toBe('Methods');
  });

  it('handles text without headings', () => {
    const text = 'Just plain text with no markdown headings.\n\nSecond paragraph.';
    const chunks = service.chunk(text, 'd', { strategy: 'markdown', chunkSize: 500, overlap: 0, minChunkSize: 5 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.heading).toBeUndefined();
  });

  it('supports H1 through H4 levels', () => {
    const text = '# H1\nContent one.\n\n#### H4\nContent four.';
    const chunks = service.chunk(text, 'd', { strategy: 'markdown', chunkSize: 500, overlap: 0, minChunkSize: 5 });
    const headings = chunks.map(c => c.metadata.heading).filter(Boolean);
    expect(headings).toContain('H1');
    expect(headings).toContain('H4');
  });

  it('sub-splits large sections while preserving heading', () => {
    const longBody = 'Paragraph ' + 'X'.repeat(600) + '.\n\n' + 'Paragraph ' + 'Y'.repeat(600) + '.';
    const text = '## Big Section\n' + longBody;
    const chunks = service.chunk(text, 'd', { strategy: 'markdown', chunkSize: 500, overlap: 0, minChunkSize: 50 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // All sub-chunks share the same section heading
    for (const c of chunks) {
      expect(c.metadata.heading).toBe('Big Section');
    }
  });
});

// ── default strategy ───────────────────────────────────────

describe('default behavior', () => {
  it('uses markdown when no strategy specified', () => {
    // Default minChunkSize is 50, so provide enough text to reach it
    const text = '## Test\n' + 'Some content that is long enough to exceed the default minimum chunk size of 50 characters.';
    const chunks = service.chunk(text, 'd');
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.strategy).toBe('markdown');
  });

  it('falls back to markdown for unknown strategy', () => {
    const text = '## Test\n' + 'Some content that is long enough to exceed the default minimum chunk size of 50 characters.';
    const chunks = service.chunk(text, 'd', { strategy: 'nonexistent' as any });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.strategy).toBe('markdown');
  });
});
