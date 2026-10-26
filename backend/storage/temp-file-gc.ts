// Temp-file garbage collection (TB-3) — reclaim `DATA_DIR/tmp/*` artefacts left
// behind when a Docling parse is interrupted (worker crash, cancel, kill) before
// its `finally` block could remove the working directory.
//
// The Docling processor (backend/parser/docling.ts) creates one temp dir per
// parse with a stable prefix — `docling_<ts>`, `docling_buf_<ts>`,
// `docling_str_<ts>` — and removes it in a `finally`. A process death between
// `mkdir` and the `finally` leaks that dir; it is never referenced again by any
// source/document, so it is safe to delete once it is older than the stale
// threshold. We scope strictly to the known prefixes so any other consumer of
// DATA_DIR/tmp is never touched.
//
// Dry-run-first like the source-file GC: `run(true)` returns a non-sensitive
// report (paths/sizes/mtimes, never file bodies) and removes nothing.
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('temp-file-gc');

/** Docling temp-artefact prefixes — the only entries this GC ever touches. */
const DOCLING_PREFIXES = ['docling_', 'docling_buf_', 'docling_str_'] as const;

/** Default stale threshold: a temp artefact older than 1h is considered leaked. */
const DEFAULT_STALE_MS = 60 * 60 * 1000;

export interface TempFileGcOptions {
  /** DATA_DIR root. */
  dataDir: string;
  /** Minimum age before a leaked temp entry is eligible. */
  staleMs?: number;
  /** Clock override (tests). */
  now?: Date;
}

export interface TempFileGcCandidate {
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
  eligible: boolean;
}

export interface TempFileGcReport {
  dryRun: boolean;
  scanned: number;
  eligible: number;
  removed: number;
  skipped: number;
  failures: number;
  candidates: TempFileGcCandidate[];
}

export class TempFileGc {
  private readonly dataDir: string;
  private readonly staleMs: number;
  private readonly now: Date;

  constructor(options: TempFileGcOptions) {
    this.dataDir = options.dataDir;
    this.staleMs = options.staleMs ?? DEFAULT_STALE_MS;
    this.now = options.now ?? new Date();
  }

  async run(dryRun: boolean): Promise<TempFileGcReport> {
    const tmpDir = path.resolve(this.dataDir, 'tmp');
    const candidates = this.listCandidates(tmpDir);
    const eligible = candidates.filter((c) => c.eligible);

    let removed = 0;
    let failures = 0;
    if (!dryRun) {
      for (const c of eligible) {
        try {
          fs.rmSync(c.path, { recursive: true, force: true });
          removed += 1;
        } catch (err) {
          failures += 1;
          logger.error('temp-file removal failed', err as Error, { path: c.path });
        }
      }
    }

    const report: TempFileGcReport = {
      dryRun,
      scanned: candidates.length,
      eligible: eligible.length,
      removed,
      skipped: candidates.length - eligible.length,
      failures,
      candidates,
    };

    logger.info(
      `temp-file GC ${dryRun ? 'dry-run' : 'run'}: scanned=${report.scanned} eligible=${report.eligible} ` +
        `removed=${report.removed} skipped=${report.skipped} failures=${report.failures}`,
      { dataDir: this.dataDir },
    );

    return report;
  }

  private listCandidates(tmpDir: string): TempFileGcCandidate[] {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(tmpDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const out: TempFileGcCandidate[] = [];
    for (const entry of entries) {
      if (!DOCLING_PREFIXES.some((p) => entry.name.startsWith(p))) continue;
      const abs = path.join(tmpDir, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      const size = entry.isDirectory() ? this.dirSize(abs, stat) : stat.size;
      const eligible = this.now.getTime() - stat.mtimeMs >= this.staleMs;
      out.push({ name: entry.name, path: abs, size, mtimeMs: stat.mtimeMs, eligible });
    }
    return out;
  }

  /** Best-effort recursive size for a leaked directory (never throws). */
  private dirSize(dir: string, rootStat: fs.Stats): number {
    let total = rootStat.size;
    try {
      for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
        const childAbs = path.join(dir, child.name);
        try {
          const st = fs.statSync(childAbs);
          total += child.isDirectory() ? this.dirSize(childAbs, st) : st.size;
        } catch {
          /* ignore unreadable child */
        }
      }
    } catch {
      /* ignore */
    }
    return total;
  }
}
