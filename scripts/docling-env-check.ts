// Docling environment check — verifies the Python 3.12 + Docling toolchain
// end-to-end so a fresh Windows checkout can be diagnosed in one command.
//
//   npx tsx scripts/docling-env-check.ts           # full check (incl. real parse)
//   npx tsx scripts/docling-env-check.ts --quick   # skip the (slow) real parse
//
// Checks, in order:
//   1. Node runtime version
//   2. Python interpreter (DOCLING_PYTHON | python) + version gate (3.10–3.12)
//   3. Docling CLI (DOCLING_CMD | docling) + full version block
//   4. Python `import docling` probe + resolved package version
//   5. Model cache presence (~/.cache/huggingface/hub/models--docling-project--*)
//   6. Actual parse: generate a tiny PDF, `docling convert` it, assert markdown
//
// Exits 0 only when every enabled check passes; non-zero (with a FAIL summary)
// otherwise. The supported-Python set mirrors backend/parser/docling.ts
// (DOCLING_PYTHON_MINORS) — keep the two in sync.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Reuse the production probe budget so this doctor and `resolveDoclingCommand()`
// can never drift apart (a slow ~18s `docling --version` must not be misread as
// a missing dependency).
import { DOCLING_PROBE_TIMEOUT_MS } from '../backend/parser/docling.js';

const execFileAsync = promisify(execFile);

const SUPPORTED_MINORS = new Set([10, 11, 12]);

const failures: string[] = [];
function fail(name: string, detail: string) {
  failures.push(`${name}: ${detail}`);
}
function ok(name: string, detail: string) {
  console.log(`  [PASS] ${name} — ${detail}`);
}

// ---- tiny valid text-only PDF (same xref technique as make-image-fixtures.mjs) ----
function minimalTextPdf(): Buffer {
  const chunks: Buffer[] = [];
  const offsets = new Map<number, number>();
  chunks.push(Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'));
  const addObj = (num: number, body: string) => {
    offsets.set(num, Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${num} 0 obj\n`, 'latin1'));
    chunks.push(Buffer.from(body, 'latin1'));
    chunks.push(Buffer.from('\nendobj\n', 'latin1'));
  };
  addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  addObj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const content = 'BT /F1 24 Tf 72 720 Td (Docling Env Check Fixture) Tj ET';
  addObj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xrefOffset = Buffer.concat(chunks).length;
  const n = 6;
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) xref += `${String(offsets.get(i)!).padStart(10, '0')} 00000 n \n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  chunks.push(Buffer.from(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

export async function run(cmd: string, args: string[], timeoutMs = DOCLING_PROBE_TIMEOUT_MS): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: timeoutMs, windowsHide: true });
    return { ok: true, stdout: String(stdout).trim(), stderr: String(stderr).trim() };
  } catch (err: any) {
    return { ok: false, stdout: String(err.stdout ?? '').trim(), stderr: String(err.stderr ?? err.message ?? '').trim() };
  }
}

async function main() {
  const quick = process.argv.includes('--quick');
  console.log('Docling environment check\n');

  // 1. Node
  ok('Node', process.version);

  // 2. Python interpreter + version gate
  const python = process.env.DOCLING_PYTHON || 'python';
  const pyVer = await run(python, ['--version']);
  if (!pyVer.ok) {
    fail('Python', `"${python}" not runnable — ${pyVer.stderr || pyVer.stdout || 'no output'}`);
  } else {
    const m = pyVer.stdout.match(/Python\s+(\d+)\.(\d+)/);
    if (!m) {
      fail('Python', `unparseable version output: ${pyVer.stdout}`);
    } else {
      const [major, minor] = [Number(m[1]), Number(m[2])];
      if (major === 3 && SUPPORTED_MINORS.has(minor)) {
        ok('Python', `${pyVer.stdout} (supported 3.10–3.12)`);
      } else {
        fail('Python', `${pyVer.stdout} — Docling 2.111.0 requires 3.10–3.12; install Python 3.12 and set DOCLING_PYTHON`);
      }
    }
  }

  // 3. Docling CLI + version block
  const docling = process.env.DOCLING_CMD || 'docling';
  const docVer = await run(docling, ['--version']);
  if (!docVer.ok) {
    fail('Docling CLI', `"${docling}" not runnable — ${docVer.stderr || docVer.stdout || 'no output'}`);
  } else {
    const versionLine = docVer.stdout.split('\n')[0] ?? docVer.stdout;
    ok('Docling CLI', versionLine);
  }

  // 4. Python import probe + resolved version
  const importProbe = await run(python, ['-c', 'import docling, importlib.metadata; print(importlib.metadata.version("docling"))']);
  if (!importProbe.ok) {
    fail('import docling', `not importable in interpreter "${python}" (set DOCLING_PYTHON to the Python 3.12 that has docling) — ${importProbe.stderr || 'no output'}`);
  } else {
    ok('import docling', importProbe.stdout || 'imported');
  }

  // 5. Model cache
  const hfBase = process.env.HF_HOME || path.join(os.homedir(), '.cache', 'huggingface');
  const models = [
    ['docling-models', 'models--docling-project--docling-models'],
    ['layout model', 'models--docling-project--docling-layout-heron'],
  ];
  for (const [label, dir] of models) {
    const snapshots = path.join(hfBase, 'hub', dir, 'snapshots');
    const present = fs.existsSync(snapshots) && fs.readdirSync(snapshots).length > 0;
    if (present) ok(`Model cache (${label})`, snapshots);
    else fail('Model cache', `${label} not cached at ${snapshots} — Docling will download on first parse (needs network)`);
  }

  // 6. Actual parse
  if (quick) {
    console.log('  [SKIP] real parse (--quick)');
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docling-env-check-'));
    const pdf = path.join(tmp, 'check.pdf');
    fs.writeFileSync(pdf, minimalTextPdf());
    const out = path.join(tmp, 'out');
    fs.mkdirSync(out, { recursive: true });
    console.log('  … running a real parse (may take ~10–15s on first run, downloads models)');
    const parse = await run(docling, ['convert', pdf, '--from', 'pdf', '--to', 'md', '--output', out], 180000);
    const mdFile = path.join(out, 'check.md');
    const md = parse.ok && fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf-8') : '';
    fs.rmSync(tmp, { recursive: true, force: true });
    if (md.trim()) {
      ok('Real parse', `${md.trim().length} bytes of markdown produced`);
    } else {
      fail('Real parse', `no markdown produced — ${parse.stderr || parse.stdout || 'unknown error'}`);
    }
  }

  // Summary
  console.log('');
  if (failures.length === 0) {
    console.log('Docling environment: OK');
    process.exit(0);
  } else {
    console.log('Docling environment: FAIL');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

// Run only when executed directly (`npm run docling:doctor`). When this module is
// imported by a test, `process.argv[1]` is the test runner, so `main()` is skipped.
const invokedAsMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsMain) {
  main();
}
