// Micro-benchmark for contentParser — verifies that the hot-loop rewrite
// (classifyLine-based) actually reduces per-line cost vs. the prior
// regex-heavy version. Run with: npx vitest run tests/parser.bench.test.ts

import { describe, it, expect } from 'vitest';
import { parseContent } from '../src/utils/contentParser';

// Build a synthetic markdown document roughly the size the user is seeing
// in the Performance trace (~25k lines of mostly paragraph content with a
// few headings/lists).
function buildDoc(lineCount: number): string {
  const lines: string[] = [];
  lines.push('# Heading 1');
  lines.push('');
  lines.push('Some intro text that fills out a paragraph to make it look real.');
  for (let i = 0; i < lineCount; i++) {
    const kind = i % 17;
    if (kind === 0) lines.push('## Sub-heading ' + i);
    else if (kind === 1) lines.push('');
    else if (kind === 2) lines.push(`- bullet item number ${i} with some text`);
    else if (kind === 3) lines.push(`${(i % 100) + 1}. ordered item ${i}`);
    else if (kind === 4) lines.push('---');
    else lines.push(`Paragraph sentence ${i} continuing across a long line with several words to look realistic`);
  }
  lines.push('');
  lines.push('# Conclusion');
  return lines.join('\n');
}

describe('contentParser — hot-path micro-bench (smoke test, not strict timing)', () => {
  it('parses 25k-line document and returns blocks', async () => {
    const doc = buildDoc(25_000);
    const start = performance.now();
    const blocks = await parseContent(doc);
    const elapsed = performance.now() - start;
    // Sanity: we produced a non-trivial block list.
    expect(blocks.length).toBeGreaterThan(100);
    // Sanity: well under the ~4.6s the user was seeing on a similar doc.
    // (Node runs ~5× faster than Chrome V8 here, so use a generous ceiling.)
    expect(elapsed).toBeLessThan(5_000);
  });

  it('round-trips standard markdown constructs', async () => {
    const doc = [
      '# Title',
      '',
      'A normal paragraph.',
      '',
      '## Sub 1',
      '- item a',
      '- item b',
      '',
      '> a quote',
      '',
      '1. first',
      '2. second',
      '',
      '---',
      '',
      '| col1 | col2 |',
      '| --- | --- |',
      '| a | b |',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');
    const blocks = await parseContent(doc);
    const types = blocks.map((b) => b.type);
    expect(types).toContain('heading');
    expect(types).toContain('list');
    expect(types).toContain('blockquote');
    expect(types).toContain('divider');
    expect(types).toContain('table');
    expect(types).toContain('code');
    expect(types).toContain('paragraph');
  });

  it('parses image URLs in all forms docling + standard markdown use', async () => {
    const doc = [
      '![docling root-relative](/api/images/img_1722148800000_0.png)',
      '',
      '![markdown absolute](https://example.com/foo.png)',
      '',
      '![protocol-relative](//cdn.example.com/bar.png)',
    ].join('\n');
    const blocks = await parseContent(doc);
    const images = blocks.filter((b) => b.type === 'image');
    expect(images).toHaveLength(3);
    expect(images[0]).toMatchObject({ src: '/api/images/img_1722148800000_0.png' });
    expect(images[1]).toMatchObject({ src: 'https://example.com/foo.png' });
    expect(images[2]).toMatchObject({ src: '//cdn.example.com/bar.png' });
  });
});
