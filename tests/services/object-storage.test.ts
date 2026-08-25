import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import {
  ObjectStorageService,
  safeObjectStorageProbe,
} from '../../backend/services/object-storage.service.js';

const BASE_CONFIG = {
  enabled: true,
  endpoint: 'localhost',
  port: 9000,
  accessKey: 'test-access',
  secretKey: 'test-secret',
  bucket: 'wiki-docs',
  useSSL: false,
};

function makeService(overrides: { config?: Partial<typeof BASE_CONFIG>; client?: any } = {}) {
  const client = {
    putObject: vi.fn().mockResolvedValue({ etag: 'etag-1' }),
    getObject: vi.fn().mockResolvedValue('stream'),
    removeObject: vi.fn().mockResolvedValue(undefined),
    statObject: vi.fn().mockResolvedValue({ size: 10 }),
    presignedGetObject: vi.fn().mockResolvedValue('http://presigned/url'),
    bucketExists: vi.fn().mockResolvedValue(true),
  };
  const svc = new ObjectStorageService({
    config: { ...BASE_CONFIG, ...overrides.config },
    client: overrides.client ?? client,
  });
  return { svc, client };
}

describe('ObjectStorageService', () => {
  it('putObject uploads a buffer with content type metadata', async () => {
    const { svc, client } = makeService();
    const data = Buffer.from('pdf-bytes');
    await svc.putObject('docs/1/a.pdf', data, data.length, 'application/pdf');
    expect(client.putObject).toHaveBeenCalledWith(
      'wiki-docs',
      'docs/1/a.pdf',
      data,
      data.length,
      { 'Content-Type': 'application/pdf' },
    );
  });

  it('putObject accepts a readable stream', async () => {
    const { svc, client } = makeService();
    const stream = Readable.from(['chunk']);
    await svc.putObject('docs/1/a.md', stream, 5);
    expect(client.putObject).toHaveBeenCalledWith('wiki-docs', 'docs/1/a.md', stream, 5, undefined);
  });

  it('rejects stream uploads without an explicit byte size', async () => {
    const { svc } = makeService();
    const stream = Readable.from(['chunk']);
    await expect(svc.putObject('docs/1/a.md', stream)).rejects.toThrow(/explicit byte size/i);
  });

  it('getObject returns the object stream', async () => {
    const { svc, client } = makeService();
    await expect(svc.getObject('docs/1/a.pdf')).resolves.toBe('stream');
    expect(client.getObject).toHaveBeenCalledWith('wiki-docs', 'docs/1/a.pdf');
  });

  it('deleteObject removes the object', async () => {
    const { svc, client } = makeService();
    await svc.deleteObject('docs/1/a.pdf');
    expect(client.removeObject).toHaveBeenCalledWith('wiki-docs', 'docs/1/a.pdf');
  });

  it('headObject returns object metadata', async () => {
    const { svc, client } = makeService();
    await expect(svc.headObject('docs/1/a.pdf')).resolves.toEqual({ size: 10 });
    expect(client.statObject).toHaveBeenCalledWith('wiki-docs', 'docs/1/a.pdf');
  });

  it('getPresignedUrl returns a short-lived URL', async () => {
    const { svc, client } = makeService();
    await expect(svc.getPresignedUrl('docs/1/a.pdf', 60)).resolves.toBe('http://presigned/url');
    expect(client.presignedGetObject).toHaveBeenCalledWith('wiki-docs', 'docs/1/a.pdf', 60);
  });

  it('throws a clear error when MinIO is not configured', () => {
    const { svc } = makeService({ config: { accessKey: '', secretKey: '' } });
    expect(() => svc.getClient()).toThrow(/not configured/i);
  });

  it('is not configured when enabled is false even if credentials exist', () => {
    const { svc } = makeService({ config: { enabled: false } });
    expect(svc.isConfigured()).toBe(false);
    expect(() => svc.getClient()).toThrow(/not configured/i);
  });

  it('checkHealth reports ok when the bucket exists', async () => {
    const { svc } = makeService();
    await expect(svc.checkHealth(50)).resolves.toEqual({ ok: true });
  });

  it('checkHealth reports failure when MinIO is unreachable', async () => {
    const { svc, client } = makeService();
    client.bucketExists.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(svc.checkHealth(50)).resolves.toEqual({
      ok: false,
      reason: 'MinIO unreachable: ECONNREFUSED',
    });
  });

  it('safe probe never throws when MinIO is unavailable', async () => {
    const storage = { checkHealth: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    await expect(safeObjectStorageProbe(storage)).resolves.toEqual({
      ok: false,
      reason: 'Object storage check failed: ECONNREFUSED',
    });
  });
});
