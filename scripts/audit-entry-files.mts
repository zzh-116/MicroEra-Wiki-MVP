// Read-only bidirectional audit: entries (PostgreSQL) <-> local raw files
// (backend/data/{reports,zaozhi,laiguanxue}). No uploads, no writes to DB,
// no file deletion, no production code changes.
//
// Usage:
//   npx tsx scripts/audit-entry-files.mts
// Outputs:
//   analysis-output/entry-file-audit.json
//   analysis-output/entry-file-audit.md
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isNull } from 'drizzle-orm';
import { db } from '../backend/db/connection.js';
import { entries, wikiFiles } from '../backend/db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../backend/data');
const OUT_DIR = path.resolve(__dirname, '../analysis-output');
const SCAN_DIRS = ['reports', 'zaozhi', 'laiguanxue'];

const SUPPORTED = new Set([
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.md', '.txt', '.csv', '.html', '.htm',
  '.json', '.xml', '.yaml', '.yml', '.log',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);

const SUFFIXES = [
  '-dual', ' dual', '-mono', ' mono', '-translated', ' translated', '翻译',
  ' - 副本', '-副本', '副本', '(1)', '（1）', '(2)', '（2）',
  'v1.0', 'v0.5', 'v2.0', '1.0', '0.5', '2.0',
  '-v1.0', '-v0.5', '-v2.0', '_V2', '-V2', 'V2',
  '(科研通-ablesci.com)', '（科研通-ablesci.com）', '-ablesci.com',
];

interface LocalFile {
  relPath: string;
  fileName: string;
  ext: string;
  size: number;
  sha256: string;
}

interface EntryRow {
  id: number;
  title: string;
  type: string;
  summary: string;
  content: string;
  visibility: string;
  categoryId: number | null;
  deletedAt: Date | string | null;
  createdAt: Date | string | null;
}

interface FileMatch {
  entryId: number;
  method: string;
  confidence: number;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\u3000\s]+/g, ' ')
    .trim();
}

function baseName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName));
}

function stripSuffixes(base: string): string[] {
  const variants = new Set<string>([base]);
  let current = base;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SUFFIXES) {
      if (current.length > suffix.length && current.toLowerCase().endsWith(suffix.toLowerCase())) {
        current = current.slice(0, -suffix.length).trim();
        variants.add(current);
        changed = true;
      }
    }
  }
  return [...variants];
}

function tokenize(s: string): string[] {
  const ascii = s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const cjk = s.match(/[\u4e00-\u9fff]/g) ?? [];
  return [...ascii, ...cjk];
}

function textSimilarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  const ta = new Set(tokenize(na));
  const tb = new Set(tokenize(nb));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = new Set([...ta, ...tb]).size;
  const tokenScore = inter / union;
  if (na.includes(nb) || nb.includes(na)) {
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return Math.max(tokenScore, ratio);
  }
  return tokenScore;
}

function patentNumbers(fileName: string): string[] {
  const matches = fileName.match(/(CN\d{8,12}[A-Z.]?|US\d{6,15}|EP\d{6,15}|JP\d{6,15}|PCTCN\d+)/gi) ?? [];
  return matches.map((m) => m.replace(/\./g, '.'));
}

function idTokens(base: string): string[] {
  const out = new Set<string>();
  const compact = norm(base).replace(/[^a-z0-9]+/g, '');
  if (compact.length >= 8) out.add(compact);
  for (const n of base.match(/\d{5,}/g) ?? []) out.add(n);
  return [...out];
}

function sourceBaseFromSummary(summary: string): string[] {
  const bases = new Set<string>();
  const s = summary.trim();
  const ext = '(?:pdf|docx?|pptx?|xlsx?|txt|md|html?|png|jpe?g|gif|webp)';
  const pdfMatch = s.match(new RegExp(`imported from pdf:\\s*(.+?)\\.${ext}\\s*$`, 'i'));
  if (pdfMatch) bases.add(pdfMatch[1].trim());
  const mdMatch = s.match(new RegExp(`imported from md:\\s*(.+?)\\.md\\s*$`, 'i'));
  if (mdMatch) bases.add(mdMatch[1].trim());
  const pathMatch = s.match(new RegExp(`imported from\\s+(.+?)\\.${ext}\\s*$`, 'i'));
  if (pathMatch) {
    const raw = pathMatch[1].trim().split(/[\\/]/).pop();
    if (raw) bases.add(raw);
  }
  const autoMatch = s.match(new RegExp(`auto-imported:\\s*(.+?)\\.${ext}\\s*$`, 'i'));
  if (autoMatch) bases.add(autoMatch[1].trim());
  return [...bases];
}

function sourceFileFromSummary(summary: string): string | null {
  const m = summary.match(
    /(?:imported from|auto-imported):?\s*(?:(?:pdf|md):?\s*)?(.+?)(?:\.(pdf|docx?|pptx?|xlsx?|txt|md|html?|png|jpe?g|gif|webp))\s*$/i,
  );
  if (!m) return null;
  const raw = m[1].trim().split(/[\\/]/).pop();
  return raw ? `${raw}.${m[2]}` : null;
}

function collectFiles(dirs: string[], supported: Set<string>): string[] {
  const results: string[] = [];
  for (const dir of dirs) {
    const root = path.join(DATA_DIR, dir);
    if (!fs.existsSync(root)) continue;
    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (supported.has('*') || supported.has(path.extname(entry.name).toLowerCase())) results.push(full);
      }
    };
    walk(root);
  }
  return results.sort();
}

function sha256Of(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function buildFileInfo(filePath: string): LocalFile {
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  return {
    relPath: path.relative(DATA_DIR, filePath).replace(/\\/g, '/'),
    fileName,
    ext: path.extname(fileName).toLowerCase(),
    size: stat.size,
    sha256: sha256Of(filePath),
  };
}

function dirOf(relPath: string): string {
  return relPath.split('/')[0] || '(root)';
}

function fileKind(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.docx', '.doc'].includes(ext)) return 'word';
  if (['.pptx', '.ppt'].includes(ext)) return 'ppt';
  if (['.xlsx', '.xls', '.csv'].includes(ext)) return 'excel';
  if (['.txt', '.md'].includes(ext)) return 'text';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
  return 'other';
}

async function main() {
  const filePaths = collectFiles(SCAN_DIRS, SUPPORTED);
  const files: LocalFile[] = filePaths.map(buildFileInfo);

  // All files under backend/data for "does this referenced file exist anywhere?" checks.
  const allLocalFiles = collectFiles(['reports', 'zaozhi', 'laiguanxue', 'handwritten', 'images', 'uploads', 'tmp', 'metadata'], new Set(['*']));
  const allLocalNames = new Map<string, string[]>();
  for (const p of allLocalFiles) {
    const rel = path.relative(DATA_DIR, p).replace(/\\/g, '/');
    const name = path.basename(rel);
    const arr = allLocalNames.get(name) ?? [];
    arr.push(rel);
    allLocalNames.set(name, arr);
  }

  const entryRows = await db
    .select({
      id: entries.id,
      title: entries.title,
      type: entries.entryType,
      summary: entries.summary,
      content: entries.content,
      visibility: entries.visibility,
      categoryId: entries.categoryId,
      deletedAt: entries.deletedAt,
      createdAt: entries.createdAt,
    })
    .from(entries)
    .orderBy(entries.id);

  const wikiFileRows = await db.select().from(wikiFiles);
  const liveEntries = entryRows.filter((e) => e.deletedAt === null);
  const deletedEntries = entryRows.filter((e) => e.deletedAt !== null);

  const metaEntries: Array<{ id?: number; title: string; summary?: string; source: string }> = [];
  for (const metaFile of ['entries.json', 'entries_export.json', 'duplicate_content_backup.json']) {
    const p = path.join(DATA_DIR, 'metadata', metaFile);
    if (!fs.existsSync(p)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      const list = Array.isArray(parsed) ? parsed : (parsed.entries ?? []);
      for (const e of list) {
        if (e && typeof e.title === 'string') {
          metaEntries.push({
            id: typeof e.id === 'number' ? e.id : undefined,
            title: e.title,
            summary: typeof e.summary === 'string' ? e.summary : undefined,
            source: metaFile,
          });
        }
      }
    } catch {
      // ignore unreadable snapshot
    }
  }

  let pdfTitles: Record<string, string | null> = {};
  const pdfTitlesPath = path.join(__dirname, 'pdf_titles.json');
  if (fs.existsSync(pdfTitlesPath)) {
    try {
      pdfTitles = JSON.parse(fs.readFileSync(pdfTitlesPath, 'utf8'));
    } catch {
      // ignore
    }
  }

  const liveSet = new Set(liveEntries.map((e) => e.id));
  const titleSet = new Map<string, EntryRow[]>();
  for (const e of entryRows) {
    const key = norm(e.title);
    const arr = titleSet.get(key) ?? [];
    arr.push(e);
    titleSet.set(key, arr);
  }

  const entrySources: Array<{ entry: EntryRow; base: string }> = [];
  for (const e of entryRows) {
    for (const base of sourceBaseFromSummary(e.summary)) {
      entrySources.push({ entry: e, base });
    }
  }
  const sourceExactIndex = new Map<string, EntryRow[]>();
  for (const src of entrySources) {
    const key = norm(src.base);
    const arr = sourceExactIndex.get(key) ?? [];
    arr.push(src.entry);
    sourceExactIndex.set(key, arr);
  }

  // Deterministic per-file match list.
  const filesBySha = new Map<string, LocalFile[]>();
  for (const f of files) {
    const arr = filesBySha.get(f.sha256) ?? [];
    arr.push(f);
    filesBySha.set(f.sha256, arr);
  }

  const fileMatches = new Map<string, FileMatch[]>();
  const fileNotes = new Map<string, string[]>();

  for (const f of files) {
    const matches: FileMatch[] = [];
    const notes: string[] = [];
    const base = baseName(f.fileName);
    const variants = stripSuffixes(base);

    const push = (entryId: number, method: string, confidence: number) => {
      matches.push({ entryId, method, confidence });
      notes.push(`${method}(${confidence})`);
    };

    // 1. wiki_files linkage (currently empty).
    for (const w of wikiFileRows) {
      if (norm(w.originalFilename) === norm(f.fileName) || norm(w.storagePath) === norm(f.relPath)) {
        push(w.entryId, 'wiki_file_link', 0.98);
      }
    }

    // 2. exact title (the rule used by the current migration dry-run).
    for (const e of entryRows) {
      if (e.title === base && liveSet.has(e.id)) {
        push(e.id, 'exact_title', 0.98);
      }
    }

    // 3. normalized title (dash/whitespace tolerant).
    for (const e of titleSet.get(norm(base)) ?? []) {
      if (liveSet.has(e.id) && !matches.some((m) => m.entryId === e.id)) {
        push(e.id, 'normalized_title', 0.95);
      }
    }

    // 4. exact source-file summary match.
    for (const e of sourceExactIndex.get(norm(base)) ?? []) {
      if (liveSet.has(e.id) && !matches.some((m) => m.entryId === e.id)) {
        push(e.id, 'source_summary', 0.95);
      }
    }

    // 5. sha256 duplicate of a file that has a high-confidence match.
    const dupGroup = filesBySha.get(f.sha256) ?? [];
    for (const df of dupGroup) {
      if (df.relPath === f.relPath) continue;
      const dupMatches = fileMatches.get(df.relPath) ?? [];
      for (const dm of dupMatches) {
        if (dm.confidence >= 0.9 && !matches.some((m) => m.entryId === dm.entryId)) {
          push(dm.entryId, 'sha256_duplicate', dm.confidence - 0.01);
        }
      }
    }

    // 6. source-file variant (e.g. original vs -dual translation).
    for (const src of entrySources) {
      if (!liveSet.has(src.entry.id)) continue;
      if (norm(src.base) === norm(base)) continue;
      const srcVariants = stripSuffixes(src.base);
      if (srcVariants.some((v) => variants.includes(v) && v.length >= 8)) {
        push(src.entry.id, 'source_file_variant', 0.85);
      }
    }

    // 7. metadata snapshot entries that still exist in DB.
    for (const m of metaEntries) {
      if (m.id && !liveSet.has(m.id)) continue;
      const titleEq = norm(m.title) === norm(base) || variants.some((v) => norm(m.title) === norm(v));
      const summaryHit = m.summary && (norm(m.summary).includes(norm(f.fileName)) || norm(m.summary).includes(norm(f.relPath)));
      if (!titleEq && !summaryHit) continue;
      const dbEntry =
        (m.id ? entryRows.find((e) => e.id === m.id) : undefined) ??
        entryRows.find((e) => norm(e.title) === norm(m.title));
      if (dbEntry && liveSet.has(dbEntry.id) && !matches.some((x) => x.entryId === dbEntry.id)) {
        push(dbEntry.id, 'metadata_in_db', 0.85);
      }
    }

    // 8. pdf_titles.json extracted title vs entry title.
    for (const v of [...new Set([base, ...variants])]) {
      const extracted = pdfTitles[v];
      if (!extracted || extracted.length < 10) continue;
      if (/^(license, which permits|research open access|type original research|procedia manufacturing|extended author information)/i.test(extracted)) continue;
      for (const e of liveEntries) {
        if (matches.some((m) => m.entryId === e.id)) continue;
        const ne = norm(e.title);
        const nx = norm(extracted);
        let s = textSimilarity(e.title, extracted);
        if (nx.length >= 12 && (ne.startsWith(nx) || nx.startsWith(ne))) {
          s = Math.max(s, Math.min(ne.length, nx.length) / Math.max(ne.length, nx.length));
          if (s < 0.6) s = 0.6;
        }
        if (s >= 0.6) push(e.id, 'pdf_title', s >= 0.85 ? 0.85 : 0.7);
      }
    }

    // 9. patent number.
    for (const pn of patentNumbers(f.fileName)) {
      const key = norm(pn);
      for (const e of liveEntries) {
        if (matches.some((m) => m.entryId === e.id)) continue;
        if (norm(e.title).includes(key)) push(e.id, 'patent_number', 0.75);
      }
    }

    // 10. journal ID / DOI token.
    for (const token of idTokens(base)) {
      for (const e of liveEntries) {
        if (matches.some((m) => m.entryId === e.id)) continue;
        const haystack = `${norm(e.title)} ${norm(e.summary)}`;
        if (haystack.includes(token)) push(e.id, 'id_token', 0.7);
      }
    }

    // 11. fuzzy title similarity.
    for (const e of liveEntries) {
      if (matches.some((m) => m.entryId === e.id)) continue;
      const s = textSimilarity(e.title, base);
      if (s >= 0.6) push(e.id, 'fuzzy_title', 0.65);
      else if (s >= 0.35) push(e.id, 'fuzzy_title_low', 0.5);
    }

    // Deduplicate, keep best confidence per entry.
    const best = new Map<number, FileMatch>();
    for (const m of matches) {
      const prev = best.get(m.entryId);
      if (!prev || m.confidence > prev.confidence) best.set(m.entryId, m);
    }
    fileMatches.set(
      f.relPath,
      [...best.values()].sort((a, b) => b.confidence - a.confidence),
    );
    fileNotes.set(f.relPath, notes);
  }

  // ---- Entry source classification ----
  const classifySource = (
    e: EntryRow,
    matched: Array<{ relPath: string; method: string; confidence: number }>,
  ) => {
    const summary = e.summary || '';
    const sourceFile = sourceFileFromSummary(summary);
    if (/^Imported from sandbox:/i.test(summary)) {
      return {
        source: 'sandbox',
        source_type: 'sandbox_project',
        source_file: null,
        source_detail: `summary: ${summary.slice(0, 120)}`,
        source_where: null,
      };
    }
    if (summary.startsWith('Imported from') || summary.startsWith('Auto-imported')) {
      if (sourceFile) {
        const existsInScan = files.some((f) => norm(f.fileName) === norm(sourceFile));
        const baseNoExt = path.basename(sourceFile, path.extname(sourceFile));
        const existsAnywhere = allLocalNames.has(sourceFile);
        const existsVariant = !existsAnywhere && [...allLocalNames.keys()].some((n) => n.startsWith(baseNoExt + '_'));
        const where = existsInScan
          ? 'scanned_dir'
          : existsAnywhere
            ? 'other_dir'
            : existsVariant
              ? 'other_dir_name_variant'
              : 'missing';
        if (/^\d{4}\.\d{4,5}v\d+/.test(norm(sourceFile))) {
          return {
            source: 'arxiv_local_pdf',
            source_type: 'arxiv_pdf',
            source_file: sourceFile,
            source_detail: `summary: ${summary.slice(0, 120)}`,
            source_where: where,
          };
        }
        return {
          source: 'local_file',
          source_type: fileKind(sourceFile),
          source_file: sourceFile,
          source_detail: `summary: ${summary.slice(0, 120)}`,
          source_where: where,
        };
      }
      return {
        source: 'local_file',
        source_type: 'unknown',
        source_file: null,
        source_detail: `summary: ${summary.slice(0, 120)}`,
        source_where: 'unknown',
      };
    }
    const confirmedMatched = matched.filter((m) => m.confidence >= 0.85);
    if (confirmedMatched.length > 0) {
      const kinds = [...new Set(confirmedMatched.map((m) => fileKind(path.basename(m.relPath))))];
      return {
        source: 'local_file',
        source_type: kinds.length === 1 ? kinds[0] : 'mixed',
        source_file: confirmedMatched[0].relPath,
        source_detail: `matched ${confirmedMatched.length} local file(s)`,
        source_where: 'scanned_dir',
      };
    }
    if (e.type === 'sandbox_project') {
      return { source: 'sandbox', source_type: 'sandbox_project', source_file: null, source_detail: '', source_where: null };
    }
    if (e.type === 'data_standard' || e.type === 'data_item') {
      return { source: 'data_standard', source_type: e.type, source_file: null, source_detail: '', source_where: null };
    }
    if (e.type === 'handwritten_note') {
      return { source: 'handwritten', source_type: 'handwritten_note', source_file: null, source_detail: '', source_where: null };
    }
    if (/^\d{4}\.\d{4,5}v\d+/.test(norm(e.title)) || /\d{4}\.\d{4,5}v\d+/.test(norm(summary))) {
      return { source: 'arxiv', source_type: 'academic_paper', source_file: null, source_detail: 'arXiv id pattern', source_where: null };
    }
    if (e.type === 'academic_paper' && /\b10\.\d{4,9}\//.test(e.summary + ' ' + e.content)) {
      return { source: 'doi_crossref', source_type: 'academic_paper', source_file: null, source_detail: 'DOI in content', source_where: null };
    }
    return {
      source: 'manual_or_unknown',
      source_type: e.type,
      source_file: null,
      source_detail: `type=${e.type}, category=${e.categoryId}`,
      source_where: null,
    };
  };

  // ---- Forward table: entry -> files ----
  const entryFiles = new Map<number, Array<{ relPath: string; method: string; confidence: number }>>();
  for (const [rel, ms] of fileMatches) {
    for (const m of ms) {
      const arr = entryFiles.get(m.entryId) ?? [];
      arr.push({ relPath: rel, method: m.method, confidence: m.confidence });
      entryFiles.set(m.entryId, arr);
    }
  }

  const forward = liveEntries.map((e) => {
    const matched = (entryFiles.get(e.id) ?? []).sort((a, b) => b.confidence - a.confidence);
    const confirmed = matched.filter((m) => m.confidence >= 0.85);
    const src = classifySource(e, matched);
    return {
      entry_id: e.id,
      entry_title: e.title,
      entry_type: e.type,
      source: src.source,
      source_type: src.source_type,
      source_file: src.source_file,
      source_where: src.source_where,
      file_count_all: matched.length,
      file_count_confirmed: confirmed.length,
      matched_files: matched,
      match_method: [...new Set(matched.map((m) => m.method))],
      confidence: confirmed.length > 0 ? 0.9 : matched.length > 0 ? matched[0].confidence : 0,
      has_confirmed_file: confirmed.length > 0,
    };
  });

  // ---- Reverse table: file -> entries ----
  const reverse = files.map((f) => {
    const ms = (fileMatches.get(f.relPath) ?? []).sort((a, b) => b.confidence - a.confidence);
    const confirmed = ms.filter((m) => m.confidence >= 0.85);
    const matchedTitles = ms.map((m) => {
      const e = entryRows.find((x) => x.id === m.entryId);
      return e ? e.title : '';
    });
    const dupWith = (filesBySha.get(f.sha256) ?? []).filter((x) => x.relPath !== f.relPath);
    const dupLinked = dupWith.some((df) => (fileMatches.get(df.relPath) ?? []).some((m) => m.confidence >= 0.9));
    let recommended_action: string;
    if (confirmed.length > 0) {
      recommended_action = dupLinked ? 'migrate_and_link_reuse_object' : 'migrate_and_link';
    } else if (ms.length > 0) {
      recommended_action = 'review_then_link';
    } else {
      recommended_action = 'keep_orphan';
    }
    return {
      local_file: f.relPath,
      file_name: f.fileName,
      dir: dirOf(f.relPath),
      sha256: f.sha256,
      size: f.size,
      matched_entry_ids: ms.map((m) => m.entryId),
      matched_entry_titles: matchedTitles,
      match_method: [...new Set(ms.map((m) => m.method))],
      confidence: confirmed.length > 0 ? 0.9 : ms.length > 0 ? ms[0].confidence : 0,
      duplicate_of: dupWith.map((x) => x.relPath),
      recommended_action,
    };
  });

  // ---- Stats ----
  const confirmedFilesByEntry = new Map<number, number>();
  for (const row of forward) confirmedFilesByEntry.set(row.entry_id, row.file_count_confirmed);

  const entryWithFile = liveEntries.filter((e) => (confirmedFilesByEntry.get(e.id) ?? 0) > 0);
  const entryWithoutFile = liveEntries.filter((e) => (confirmedFilesByEntry.get(e.id) ?? 0) === 0);
  const entryOneFile = liveEntries.filter((e) => (confirmedFilesByEntry.get(e.id) ?? 0) === 1);
  const entryMultiFile = liveEntries.filter((e) => (confirmedFilesByEntry.get(e.id) ?? 0) > 1);

  const fileWithConfirmedEntry = files.filter((f) =>
    (fileMatches.get(f.relPath) ?? []).some((m) => m.confidence >= 0.85),
  );
  const fileWithoutEntry = files.filter((f) => (fileMatches.get(f.relPath) ?? []).length === 0);
  const fileWithNoConfirmedButCandidates = files.filter(
    (f) =>
      (fileMatches.get(f.relPath) ?? []).length > 0 &&
      !(fileMatches.get(f.relPath) ?? []).some((m) => m.confidence >= 0.85),
  );
  const fileMultiEntry = files.filter(
    (f) => (fileMatches.get(f.relPath) ?? []).filter((m) => m.confidence >= 0.85).length > 1,
  );

  const duplicateGroups = new Map<string, string[]>();
  for (const f of files) {
    const group = files.filter((x) => x.sha256 === f.sha256);
    if (group.length > 1) duplicateGroups.set(f.sha256, group.map((x) => x.relPath));
  }
  const duplicateFiles = files.filter((f) => (filesBySha.get(f.sha256) ?? []).length > 1);

  const sourceCounts = new Map<string, number>();
  for (const row of forward) {
    const s = row.source;
    sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1);
  }
  const sourceTypeCounts = new Map<string, number>();
  for (const row of forward) {
    const s = row.source_type;
    sourceTypeCounts.set(s, (sourceTypeCounts.get(s) ?? 0) + 1);
  }

  const stats = {
    entries_total: entryRows.length,
    entries_live: liveEntries.length,
    entries_soft_deleted: deletedEntries.length,
    local_files_scanned: files.length,
    unique_sha256_files: new Set(files.map((f) => f.sha256)).size,
    wiki_files_rows: wikiFileRows.length,
    A_entry_has_file: entryWithFile.length,
    B_entry_no_file: entryWithoutFile.length,
    C_entry_one_file: entryOneFile.length,
    D_entry_multiple_files: entryMultiFile.length,
    E_file_multiple_entries: fileMultiEntry.length,
    F_file_no_entry: fileWithoutEntry.length,
    F_file_candidate_only: fileWithNoConfirmedButCandidates.length,
    G_duplicate_groups: duplicateGroups.size,
    G_duplicate_files: duplicateFiles.length,
    source_counts: Object.fromEntries(sourceCounts),
    source_type_counts: Object.fromEntries(sourceTypeCounts),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    stats,
    forward: forward,
    reverse: reverse,
    soft_deleted_entries: deletedEntries.map((e) => ({
      entry_id: e.id,
      entry_title: e.title,
      entry_type: e.type,
      deletedAt: e.deletedAt,
    })),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, 'entry-file-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const csvEscape = (v: unknown) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const entryCsv = [
    ['entry_id', 'entry_title', 'entry_type', 'source', 'source_type', 'source_file', 'file_count_confirmed', 'file_count_all', 'match_method', 'confidence'],
    ...forward.map((r) => [
      r.entry_id,
      r.entry_title,
      r.entry_type,
      r.source,
      r.source_type,
      r.source_file ?? '',
      r.file_count_confirmed,
      r.file_count_all,
      r.match_method.join('|'),
      r.confidence,
    ]),
  ]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');
  fs.writeFileSync(path.join(OUT_DIR, 'entry-file-audit-entries.csv'), '\uFEFF' + entryCsv, 'utf8');

  const fileCsv = [
    ['local_file', 'sha256', 'size', 'dir', 'matched_entry_ids', 'matched_entry_titles', 'match_method', 'confidence', 'recommended_action'],
    ...reverse.map((r) => [
      r.local_file,
      r.sha256,
      r.size,
      r.dir,
      r.matched_entry_ids.join('|'),
      r.matched_entry_titles.join('|'),
      r.match_method.join('|'),
      r.confidence,
      r.recommended_action,
    ]),
  ]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');
  fs.writeFileSync(path.join(OUT_DIR, 'entry-file-audit-files.csv'), '\uFEFF' + fileCsv, 'utf8');

  const md = [];
  md.push('# Entry ↔ 本地文件资产盘点（只读）');
  md.push('');
  md.push(`生成时间: ${report.generatedAt}`);
  md.push('');
  md.push('## 总览');
  md.push('');
  md.push(`- entries 总数: ${stats.entries_total}（live ${stats.entries_live} / 软删除 ${stats.entries_soft_deleted}）`);
  md.push(`- 本地扫描文件: ${stats.local_files_scanned}（唯一 SHA256: ${stats.unique_sha256_files}）`);
  md.push(`- wiki_files 记录: ${stats.wiki_files_rows}`);
  md.push('');
  md.push('## 双向关系统计');
  md.push('');
  md.push('| 指标 | 数量 |');
  md.push('| --- | --- |');
  md.push(`| A. entry 有文件 | ${stats.A_entry_has_file} |`);
  md.push(`| B. entry 没有文件 | ${stats.B_entry_no_file} |`);
  md.push(`| C. entry 对应 1 个文件 | ${stats.C_entry_one_file} |`);
  md.push(`| D. entry 对应多个文件 | ${stats.D_entry_multiple_files} |`);
  md.push(`| E. 1 个文件对应多个 entry | ${stats.E_file_multiple_entries} |`);
  md.push(`| F. 文件找不到 entry | ${stats.F_file_no_entry}（另有仅候选 ${stats.F_file_candidate_only}） |`);
  md.push(`| G. 重复文件组 / 重复物理文件 | ${stats.G_duplicate_groups} / ${stats.G_duplicate_files} |`);
  md.push('');
  md.push('## source 分布（live entries）');
  md.push('');
  md.push('| source | 数量 |');
  md.push('| --- | --- |');
  for (const [k, v] of Object.entries(stats.source_counts)) md.push(`| ${k} | ${v} |`);
  md.push('');
  md.push('| source_type | 数量 |');
  md.push('| --- | --- |');
  for (const [k, v] of Object.entries(stats.source_type_counts)) md.push(`| ${k} | ${v} |`);
  md.push('');
  md.push('## 迁移建议（reverse 表汇总）');
  md.push('');
  md.push('| 建议 | 文件数 | 唯一 SHA256 |');
  md.push('| --- | --- | --- |');
  const actionCounts = new Map<string, { files: number; sha: Set<string> }>();
  for (const r of reverse) {
    const acc = actionCounts.get(r.recommended_action) ?? { files: 0, sha: new Set<string>() };
    acc.files += 1;
    acc.sha.add(r.sha256);
    actionCounts.set(r.recommended_action, acc);
  }
  for (const [k, v] of actionCounts) md.push(`| ${k} | ${v.files} | ${v.sha.size} |`);
  md.push('');
  md.push('## 引用了本地文件但文件缺失/仅 tmp 的条目');
  md.push('');
  for (const row of forward) {
    if (row.file_count_confirmed === 0 && (row.source === 'local_file' || row.source === 'arxiv_local_pdf')) {
      md.push(`- #${row.entry_id} ${row.entry_title}（${row.source_where}: ${row.source_file}）`);
    }
  }
  md.push('');
  md.push('## 说明');
  md.push('');
  md.push('- confidence >= 0.85 视为“已确认”匹配（exact_title / normalized_title / source_summary / sha256_duplicate / source_file_variant / metadata_in_db / pdf_title 强匹配）。');
  md.push('- 0.5~0.84 视为候选（pdf_title 弱匹配 / patent_number / id_token / fuzzy）。');
  md.push('- 完整逐条明细见 entry-file-audit.json。');
  const mdPath = path.join(OUT_DIR, 'entry-file-audit.md');
  fs.writeFileSync(mdPath, md.join('\n'), 'utf8');

  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nReport written to:\n  ${jsonPath}\n  ${mdPath}`);
  console.log(`  ${path.join(OUT_DIR, 'entry-file-audit-entries.csv')}`);
  console.log(`  ${path.join(OUT_DIR, 'entry-file-audit-files.csv')}`);
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
