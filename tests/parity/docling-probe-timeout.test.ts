// Regression — Docling probe timeout must not misjudge a slow-but-working CLI.
//
// Root cause of the pending-parse bug: Docling 2.111.0 imports its full ML
// stack (torch/transformers) even for `--version`, so a cold probe routinely
// takes ~18s. `resolveDoclingCommand()` used a 15s timeout, so the probe was
// killed, fell through to an unsupported interpreter, and reported
// DOCLING_DEPENDENCY_MISSING → the worker parked the job at 'pending'.
//
// This test simulates `docling --version` taking 20s (>15s, <60s) and asserts
// the command is resolved — not misjudged — and that the probe budget is the
// unified DOCLING_PROBE_TIMEOUT_MS. No real Docling/DB/Ollama is involved.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: execFileMock };
});

describe('Docling probe timeout regression', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubEnv('DOCLING_CMD', '');
    vi.stubEnv('DOCLING_PYTHON', 'python');
    execFileMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('resolves docling when `--version` takes >15s but <60s (not misjudged as missing)', async () => {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        opts: { timeout?: number },
        cb: (err: Error | null, stdout?: string, stderr?: string) => void,
      ) => {
        // The probe budget must comfortably exceed the simulated 20s runtime;
        // under the old 15s budget this process would be SIGKILL'd.
        expect(opts.timeout).toBeGreaterThanOrEqual(20_000);
        setTimeout(() => cb(null, 'Docling CLI v2.111.0', ''), 20_000);
      },
    );

    const { resolveDoclingCommand, DOCLING_PROBE_TIMEOUT_MS } = await import('../../backend/parser/docling.js');
    expect(DOCLING_PROBE_TIMEOUT_MS).toBe(60_000);

    const pending = resolveDoclingCommand();
    // Elapse the full 20s so the fake `--version` process completes.
    await vi.advanceTimersByTimeAsync(20_000);

    await expect(pending).resolves.toBe('docling');
    expect(execFileMock).toHaveBeenCalledWith(
      'docling',
      ['--version'],
      expect.objectContaining({ timeout: DOCLING_PROBE_TIMEOUT_MS }),
      expect.any(Function),
    );
  });
});
