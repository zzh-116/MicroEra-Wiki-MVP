// B-4 — doc.import_url wiring: SafeFetchError kinds map to the wire contract
// (client-fixable → validation_failed/400, runtime → internal/500) and the URL
// / response body never leak into the thrown message. No database: the KB
// lookup and the fetch are mocked, and createAndEnqueue is spied on.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  safeFetchText: vi.fn(),
  findKbById: vi.fn(),
}));

vi.mock('../../backend/services/ssrf-fetch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../backend/services/ssrf-fetch.js')>();
  return { ...actual, safeFetchText: mocks.safeFetchText };
});

vi.mock('../../backend/repositories/knowledge.repository.js', () => ({
  knowledgeRepository: { findKbById: mocks.findKbById },
}));

import { parseApiService } from '../../backend/services/parse-api.service.js';
import { SafeFetchError } from '../../backend/services/ssrf-fetch.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';

const KB = { id: 1, name: 'kb', slug: 'kb', visibility: 'internal' as const };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findKbById.mockResolvedValue(KB);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function expectKind(url: string, err: SafeFetchError, kind: 'validation_failed' | 'internal') {
  mocks.safeFetchText.mockRejectedValue(err);
  await expect(parseApiService.importUrl({ kb_id: 1, url })).rejects.toMatchObject({ kind });
}

describe('doc.import_url SSRF wiring', () => {
  it('maps ssrf_blocked → validation_failed (400) and never enqueues', async () => {
    const spy = vi.spyOn(parseApiService as any, 'createAndEnqueue');
    await expectKind('http://169.254.169.254/', new SafeFetchError('ssrf_blocked', 'URL resolves to a non-public address and is blocked'), 'validation_failed');
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps unsupported_scheme / invalid_url / dns_error → validation_failed', async () => {
    await expectKind('file:///etc/passwd', new SafeFetchError('unsupported_scheme', 'only http/https URLs are allowed'), 'validation_failed');
    await expectKind('http://user:pass@x/', new SafeFetchError('invalid_url', 'URL must not embed credentials'), 'validation_failed');
    await expectKind('http://no-such-host.invalid/', new SafeFetchError('dns_error', 'URL hostname could not be resolved'), 'validation_failed');
  });

  it('maps timeout / redirect / too_large / http_error / network → internal (500)', async () => {
    await expectKind('http://example.com/', new SafeFetchError('timeout', 'import request timed out'), 'internal');
    await expectKind('http://example.com/', new SafeFetchError('redirect', 'redirects are not allowed'), 'internal');
    await expectKind('http://example.com/', new SafeFetchError('too_large', 'import response exceeded the size limit'), 'internal');
    await expectKind('http://example.com/', new SafeFetchError('http_error', 'import request returned HTTP 500'), 'internal');
    await expectKind('http://example.com/', new SafeFetchError('network', 'import request failed'), 'internal');
  });

  it('does not leak the URL or body in the thrown error message', async () => {
    const secretUrl = 'http://user:secret@169.254.169.254/?token=abc123';
    mocks.safeFetchText.mockRejectedValue(new SafeFetchError('ssrf_blocked', 'URL resolves to a non-public address and is blocked'));
    await expect(parseApiService.importUrl({ kb_id: 1, url: secretUrl })).rejects.toSatisfy((err: unknown) => {
      return err instanceof ServiceError && !err.message.includes('169.254.169.254') && !err.message.includes('abc123') && !err.message.includes('secret');
    });
  });

  it('imports a legal public URL end-to-end (fetch → createAndEnqueue)', async () => {
    const spy = vi.spyOn(parseApiService as any, 'createAndEnqueue').mockResolvedValue({ document_id: 9, job_id: 'job-9' });
    mocks.safeFetchText.mockResolvedValue('fetched body');
    const url = 'https://example.com/page.md';
    const handle = await parseApiService.importUrl({ kb_id: 1, url });
    expect(handle).toEqual({ document_id: 9, job_id: 'job-9' });
    expect(mocks.safeFetchText).toHaveBeenCalledWith(url);
    expect(spy).toHaveBeenCalledWith(1, expect.objectContaining({
      title: url,
      content: 'fetched body',
      sourceType: 'url',
      sourceName: url,
    }));
  });
});
