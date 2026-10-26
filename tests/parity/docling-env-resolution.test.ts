// Docling environment resolution — verifies the DOCLING_CMD / DOCLING_PYTHON
// env → config mapping and `resolveDoclingCommand()` override behavior, plus the
// interpreter version gate. Each case re-imports a fresh module (vi.resetModules)
// so the module-load-time config snapshot and the 60s failure cache never leak
// between tests.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Docling environment resolution', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('config.docling reads DOCLING_CMD and DOCLING_PYTHON', async () => {
    vi.stubEnv('DOCLING_CMD', 'C:\\Python312\\Scripts\\docling.exe');
    vi.stubEnv('DOCLING_PYTHON', 'C:\\Python312\\python.exe');
    const { config } = await import('../../backend/config.js');
    expect(config.docling.command).toBe('C:\\Python312\\Scripts\\docling.exe');
    expect(config.docling.python).toBe('C:\\Python312\\python.exe');
  });

  it('config.docling defaults to PATH discovery when env is unset', async () => {
    vi.stubEnv('DOCLING_CMD', '');
    vi.stubEnv('DOCLING_PYTHON', '');
    const { config } = await import('../../backend/config.js');
    expect(config.docling.command).toBe('');
    expect(config.docling.python).toBe('python');
  });

  it('resolveDoclingCommand honors DOCLING_CMD (executable override)', async () => {
    // `node` answers `--version`, so it stands in for "a docling executable on
    // the override path". The assertion is about override precedence, not about
    // node being docling.
    vi.stubEnv('DOCLING_CMD', process.execPath);
    const { resolveDoclingCommand } = await import('../../backend/parser/docling.js');
    await expect(resolveDoclingCommand()).resolves.toBe(process.execPath);
  });

  it('resolveDoclingCommand reports CLI_NOT_EXECUTABLE for a broken DOCLING_CMD', async () => {
    vi.stubEnv('DOCLING_CMD', 'C:\\definitely\\missing\\docling.exe');
    const { resolveDoclingCommand } = await import('../../backend/parser/docling.js');
    await expect(resolveDoclingCommand()).rejects.toMatchObject({
      name: 'DoclingUnavailableError',
      code: 'CLI_NOT_EXECUTABLE',
    });
  });

  it('isDoclingSupportedPython gates the interpreter version', async () => {
    const { isDoclingSupportedPython } = await import('../../backend/parser/docling.js');
    expect(isDoclingSupportedPython(3, 10)).toBe(true);
    expect(isDoclingSupportedPython(3, 11)).toBe(true);
    expect(isDoclingSupportedPython(3, 12)).toBe(true);
    expect(isDoclingSupportedPython(3, 13)).toBe(false);
    expect(isDoclingSupportedPython(3, 15)).toBe(false);
    expect(isDoclingSupportedPython(2, 7)).toBe(false);
  });
});
