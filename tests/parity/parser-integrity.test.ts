// P2-01 — Parser adapters with content integrity.
// Verifies: (1) the dependency-free TextFallback adapter parses text formats
// without Docling, (2) every ParseResult carries the sha256 of the raw source
// bytes, (3) checksums are deterministic and consistent across the three entry
// points, and (4) binary formats degrade with a clear error rather than a crash.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TextFallbackParser } from '../../backend/parser/text.js';
import { DoclingParser } from '../../backend/parser/docling.js';
import { ParserFactory, getParserForFile, resetParser } from '../../backend/parser/factory.js';
import { sha256Buffer, sha256 } from '../../backend/utils/hash.js';

const text = new TextFallbackParser();
const docling = new DoclingParser();

function tmpFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-parser-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

describe('P2-01 TextFallback adapter', () => {
  it('parses Markdown without Docling and reports a source checksum', async () => {
    const md = '# Title\n\nSome **bold** body text.\n';
    const file = tmpFile('sample.md', md);
    const result = await text.parseFile(file);
    expect(result.sourceFormat).toBe('md');
    expect(result.markdown).toContain('# Title');
    expect(result.checksum).toBe(sha256Buffer(fs.readFileSync(file)));
  });

  it('parses CSV and plain text deterministically', async () => {
    const csv = 'a,b,c\n1,2,3\n';
    const result = await text.parseString(csv, 'data.csv');
    expect(result.sourceFormat).toBe('csv');
    expect(result.checksum).toBe(sha256(csv));
    const again = await text.parseString(csv, 'data.csv');
    expect(again.checksum).toBe(result.checksum);
  });

  it('strips HTML to text as a lossy fallback', async () => {
    const html = '<html><body><h1>Heading</h1><p>Body &amp; text</p></body></html>';
    const result = await text.parseString(html, 'page.html');
    expect(result.markdown).toContain('Heading');
    expect(result.markdown).toContain('Body & text');
    expect(result.warnings.some((w) => w.includes('fallback'))).toBe(true);
  });

  it('rejects binary formats with a clear error', async () => {
    await expect(text.parseString('not really pdf', 'x.pdf')).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' });
  });

  it('rejects empty content and empty files', async () => {
    await expect(text.parseString('   ', 'a.md')).rejects.toMatchObject({ code: 'EMPTY_CONTENT' });
    const file = tmpFile('empty.md', '');
    await expect(text.parseFile(file)).rejects.toMatchObject({ code: 'EMPTY_FILE' });
  });

  it('parseBuffer matches parseFile checksum for identical bytes', async () => {
    const content = 'buffer integrity check\n';
    const file = tmpFile('buf.md', content);
    const fromFile = await text.parseFile(file);
    const fromBuffer = await text.parseBuffer(Buffer.from(content, 'utf-8'), 'buf.md');
    expect(fromBuffer.checksum).toBe(sha256Buffer(Buffer.from(content, 'utf-8')));
    expect(fromBuffer.checksum).toBe(fromFile.checksum);
  });
});

describe('P2-01 Docling parser content integrity', () => {
  it('carries the raw-bytes checksum on the text fast-path', async () => {
    const md = '# Doc\n\nParagraph.\n';
    const file = tmpFile('doc.md', md);
    const result = await docling.parseFile(file);
    expect(result.checksum).toBe(sha256Buffer(fs.readFileSync(file)));
    expect(result.markdown).toContain('# Doc');
  });

  it('carries the utf-8 checksum on parseString', async () => {
    const content = 'string integrity';
    const result = await docling.parseString(content, 's.md');
    expect(result.checksum).toBe(sha256(content));
  });
});

describe('P2-01 format-aware fallback resolver', () => {
  beforeAll(() => {
    // Force the text provider so the resolver short-circuits without a slow
    // Docling availability probe (which shells out and can take ~30s in CI).
    process.env.PARSER_PROVIDER = 'text';
    resetParser();
  });

  afterAll(() => {
    delete process.env.PARSER_PROVIDER;
    resetParser();
  });

  it('returns a TextFallback-capable parser for text formats', async () => {
    const parser = await getParserForFile('notes.md');
    expect(parser.name).toBe('TextFallback');
  });

  it('registers both built-in adapters in the factory', () => {
    const names = ParserFactory.list();
    expect(names).toContain('docling');
    expect(names).toContain('text');
  });
});
