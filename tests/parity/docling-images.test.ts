// P1-B — parser image extraction: UUID filenames, no-overwrite filesystem
// guard, and `savedImages` surfaced on ParseResult. The DATA_DIR is isolated to
// a temp directory so the suite never writes into ./backend/data/images.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'microera-docling-images-'));
process.env.DATA_DIR = tmpDir;

const { doclingParser, newImageFileName, writeImageFile } = await import(
  '../../backend/parser/docling.js'
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Docling image extraction (P1-B UUID + no-overwrite + savedImages)', () => {
  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('newImageFileName yields a UUID stem plus the extension, unique per call', () => {
    const a = newImageFileName('.png');
    const b = newImageFileName('.png');
    expect(a.endsWith('.png')).toBe(true);
    expect(UUID_RE.test(a.slice(0, -4))).toBe(true);
    expect(a).not.toBe(b);
  });

  it('writeImageFile refuses to overwrite an existing file (no-overwrite guard)', () => {
    const dir = path.join(tmpDir, 'wx');
    fs.mkdirSync(dir, { recursive: true });
    const name = 'fixed.png';
    writeImageFile(dir, name, Buffer.from([1, 2, 3]));
    expect(() => writeImageFile(dir, name, Buffer.from([9, 9, 9]))).toThrow();
    // Original bytes untouched.
    expect(fs.readFileSync(path.join(dir, name))).toEqual(Buffer.from([1, 2, 3]));
  });

  it('parseString surfaces savedImages and rewrites data URIs to /api/images/<uuid>', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
    const result = await doclingParser.parseString(`# Doc\n\n![alt](data:image/png;base64,${png})`, 'doc.md');

    expect(result.savedImages).toBeDefined();
    expect(result.savedImages!.length).toBe(1);
    const name = result.savedImages![0];
    expect(name.endsWith('.png')).toBe(true);
    expect(UUID_RE.test(name.slice(0, -4))).toBe(true);
    expect(result.markdown).toContain(`/api/images/${name}`);
    // The file was actually written under the isolated DATA_DIR.
    expect(fs.existsSync(path.join(tmpDir, 'images', name))).toBe(true);
  });
});
