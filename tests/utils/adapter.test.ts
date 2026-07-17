// Tests for data adapter utilities
// Covers: entry type mapping, data URI stripping, field adapter, ID conversion
import { describe, it, expect } from 'vitest';
import {
  mapEntryType,
  reverseEntryType,
  stripDataUriImages,
  stripAllDataUris,
  mvpEntryToWikiEntry,
  snakeToCamel,
  camelToSnake,
  toNumId,
  toStrId,
} from '../../src/utils/adapter';

// ── Entry type mapping ──────────────────────────────────────

describe('mapEntryType', () => {
  it('maps MVP backend types to frontend types', () => {
    expect(mapEntryType('asset')).toBe('source_file');
    expect(mapEntryType('product')).toBe('project');
    expect(mapEntryType('tech')).toBe('concept');
    expect(mapEntryType('patent')).toBe('patent');
    expect(mapEntryType('data_item')).toBe('data_item');
  });

  it('returns "general" for unknown types', () => {
    expect(mapEntryType('unknown_xyz')).toBe('general');
    expect(mapEntryType('')).toBe('general');
  });
});

describe('reverseEntryType', () => {
  it('maps frontend types back to MVP backend types', () => {
    expect(reverseEntryType('project')).toBe('product');
    expect(reverseEntryType('paper')).toBe('tech');
    expect(reverseEntryType('patent')).toBe('patent');
    expect(reverseEntryType('data_item')).toBe('data_item');
    expect(reverseEntryType('concept')).toBe('tech');
    expect(reverseEntryType('template')).toBe('asset');
    expect(reverseEntryType('business_value')).toBe('asset');
    expect(reverseEntryType('source_file')).toBe('asset');
    expect(reverseEntryType('service')).toBe('tech');
    expect(reverseEntryType('api')).toBe('tech');
    expect(reverseEntryType('person')).toBe('tech');
  });

  it('returns "tech" for unknown frontend types', () => {
    expect(reverseEntryType('unknown')).toBe('tech');
    expect(reverseEntryType('')).toBe('tech');
  });
});

// ── Data URI stripping ─────────────────────────────────────

describe('stripDataUriImages', () => {
  it('strips markdown image syntax with data: URIs', () => {
    const input = 'Text ![alt](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==) more text';
    const result = stripDataUriImages(input);
    expect(result).toContain('[Embedded image: alt]');
    expect(result).not.toContain('data:image');
    expect(result).toContain('Text');
    expect(result).toContain('more text');
  });

  it('uses default label when alt text is empty', () => {
    const result = stripDataUriImages('![](data:image/png;base64,AAAA)');
    expect(result).toContain('[Embedded image: Image]');
  });

  it('strips bare data: URIs without markdown syntax', () => {
    const input = 'prefix data:image/png;base64,' + 'A'.repeat(100) + ' suffix';
    const result = stripDataUriImages(input);
    expect(result).toContain('[Embedded image omitted]');
    expect(result).not.toContain('base64');
    expect(result).toContain('prefix');
    expect(result).toContain('suffix');
  });

  it('handles text with no data URIs unchanged', () => {
    const input = 'Plain markdown with ![img](/path/to/file.png) and text';
    const result = stripDataUriImages(input);
    expect(result).toBe(input);
  });

  it('handles empty/null input gracefully', () => {
    expect(stripDataUriImages('')).toBe('');
    expect(stripDataUriImages(null as any)).toBe(null);
  });
});

describe('stripAllDataUris', () => {
  it('strips non-image data: URIs in link syntax too', () => {
    const input = '[doc](data:application/pdf;base64,AAAA)';
    const result = stripAllDataUris(input);
    expect(result).toContain('omitted');
    expect(result).not.toContain('data:');
  });

  it('strips both image and non-image data URIs', () => {
    const input = '![pic](data:image/png;base64,AAAA) and [file](data:text/plain,hello)';
    const result = stripAllDataUris(input);
    expect(result).not.toContain('data:');
    expect(result).toContain('Embedded image');
    expect(result).toContain('Linked');
  });
});

// ── Field adapter ──────────────────────────────────────────

describe('mvpEntryToWikiEntry', () => {
  const mvpInput = {
    id: 42,
    title: '测试条目',
    entry_type: 'tech',
    summary: '摘要',
    content: '正文内容',
    visibility: 'public' as const,
    category_id: 5,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    tags: ['AI', '材料'],
  };

  it('converts numeric id to string', () => {
    const result = mvpEntryToWikiEntry(mvpInput);
    expect(result.id).toBe('42');
  });

  it('maps entry_type via mapEntryType', () => {
    const result = mvpEntryToWikiEntry(mvpInput);
    expect(result.entryType).toBe('concept'); // tech → concept
  });

  it('converts category_id to spaceId', () => {
    const result = mvpEntryToWikiEntry(mvpInput);
    expect(result.spaceId).toBe('5');
  });

  it('sets spaceId to "s-uncategorized" when category_id is null', () => {
    const result = mvpEntryToWikiEntry({ ...mvpInput, category_id: undefined as any });
    expect(result.spaceId).toBe('s-uncategorized');
  });

  it('preserves tags, summary, content, visibility', () => {
    const result = mvpEntryToWikiEntry(mvpInput);
    expect(result.tags).toEqual(['AI', '材料']);
    expect(result.summary).toBe('摘要');
    expect(result.content).toBe('正文内容');
    expect(result.visibility).toBe('public');
  });

  it('sets default empty arrays for IDs and file lists', () => {
    const result = mvpEntryToWikiEntry(mvpInput);
    expect(result.sourceFileIds).toEqual([]);
    expect(result.markdownFileIds).toEqual([]);
    expect(result.referenceIds).toEqual([]);
    expect(result.relatedEntryIds).toEqual([]);
    expect(result.graphNodeIds).toEqual([]);
  });
});

// ── Key conversion ─────────────────────────────────────────

describe('snakeToCamel', () => {
  it('converts snake_case keys to camelCase', () => {
    const input = { first_name: 'John', last_name: 'Doe', user_id: 1 };
    const result = snakeToCamel(input);
    expect(result).toEqual({ firstName: 'John', lastName: 'Doe', userId: 1 });
  });

  it('handles already-camelCase keys', () => {
    const result = snakeToCamel({ name: 'test' });
    expect(result).toEqual({ name: 'test' });
  });
});

describe('camelToSnake', () => {
  it('converts camelCase keys to snake_case', () => {
    const input = { firstName: 'John', lastName: 'Doe', userId: 1 };
    const result = camelToSnake(input);
    expect(result).toEqual({ first_name: 'John', last_name: 'Doe', user_id: 1 });
  });
});

// ── ID conversion ──────────────────────────────────────────

describe('toNumId', () => {
  it('parses numeric string IDs', () => {
    expect(toNumId('42')).toBe(42);
    expect(toNumId('0')).toBe(0);
  });

  it('generates numeric hash for non-numeric string IDs', () => {
    const n = toNumId('abc123');
    expect(typeof n).toBe('number');
    expect(n).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic', () => {
    expect(toNumId('same-string')).toBe(toNumId('same-string'));
  });
});

describe('toStrId', () => {
  it('converts number to string', () => {
    expect(toStrId(42)).toBe('42');
    expect(toStrId(0)).toBe('0');
  });
});
