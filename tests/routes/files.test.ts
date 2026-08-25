import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveDataFilePath, sanitizeFileCreateInput } from '../../server/routes/files.js';

describe('resolveDataFilePath', () => {
  it('resolves a safe relative path under DATA_DIR', () => {
    const root = path.resolve('backend/data');
    expect(resolveDataFilePath(root, 'zaozhi/a.pdf')).toBe(path.join(root, 'zaozhi', 'a.pdf'));
  });

  it('rejects path traversal', () => {
    const root = path.resolve('backend/data');
    expect(() => resolveDataFilePath(root, '../secret.pdf')).toThrow(/INVALID_STORAGE_PATH/);
  });

  it('rejects absolute paths outside DATA_DIR', () => {
    const root = path.resolve('backend/data');
    expect(() => resolveDataFilePath(root, 'C:/Windows/win.ini')).toThrow(/INVALID_STORAGE_PATH/);
  });
});

describe('sanitizeFileCreateInput', () => {
  it('strips server-owned object storage metadata from client input', () => {
    const safe = sanitizeFileCreateInput({
      name: 'a.pdf',
      size: 1,
      type: 'application/pdf',
      entryId: 1,
      usageType: 'document',
      objectKey: 'documents/abc.pdf',
      objectBucket: 'wiki-docs',
      sha256: 'abc',
      contentType: 'application/pdf',
    });
    const plain = safe as Record<string, unknown>;

    expect(plain.objectKey).toBeUndefined();
    expect(plain.objectBucket).toBeUndefined();
    expect(plain.sha256).toBeUndefined();
    expect(plain.contentType).toBeUndefined();
    expect(safe).toMatchObject({ name: 'a.pdf', entryId: 1 });
  });

  it('returns an empty object for missing body', () => {
    expect(sanitizeFileCreateInput(null)).toEqual({});
    expect(sanitizeFileCreateInput(undefined)).toEqual({});
  });
});
