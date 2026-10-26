// Regression — the docling:doctor diagnostic must share the production probe
// budget, so a slow-but-working `docling --version` (~18s cold) is never misread
// as a missing dependency. The script reuses `DOCLING_PROBE_TIMEOUT_MS` from
// backend/parser/docling.ts (single source of truth), so this test asserts the
// probe `run()` actually applies that budget and still surfaces a real failure.
//
// No real Docling/DB is invoked: `node:child_process.execFile` is mocked, and the
// script's top-level `main()` is skipped because it is imported (not executed).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promisify } from 'node:util';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: execFileMock };
});

describe('docling-env-check probe timeout', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    execFileMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (execFileMock as any)[promisify.custom];
  });

  it('applies the unified 60s budget and does not misjudge a 20s-slow `docling --version`', async () => {
    let seenTimeout: number | undefined;
    // The real execFile's promisified form resolves `{ stdout, stderr }`; mimic it
    // but after a simulated 20s, which the old 15s budget would have cut short.
    (execFileMock as any)[promisify.custom] = (_cmd: string, _args: string[], opts: { timeout?: number }) => {
      seenTimeout = opts.timeout;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ stdout: 'Docling CLI v2.111.0\n', stderr: '' }), 20_000);
      });
    };

    const { run } = await import('../../scripts/docling-env-check.js');
    const { DOCLING_PROBE_TIMEOUT_MS } = await import('../../backend/parser/docling.js');

    const pending = run('docling', ['--version']);
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(seenTimeout).toBe(DOCLING_PROBE_TIMEOUT_MS);
    expect(seenTimeout).toBeGreaterThanOrEqual(20_000);
  });

  it('still reports a genuinely missing dependency as a failure', async () => {
    (execFileMock as any)[promisify.custom] = () =>
      Promise.reject(Object.assign(new Error('spawn missing-tool ENOENT'), { code: 'ENOENT' }));

    const { run } = await import('../../scripts/docling-env-check.js');
    const result = await run('missing-tool', ['--version']);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('ENOENT');
  });
});
