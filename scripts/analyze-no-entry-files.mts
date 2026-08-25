// Read-only diagnostic: analyze why legacy local documents were reported as
// no_entry by the MinIO migration dry-run, and classify each file.
// Never uploads objects, never writes wiki_files/entries, never deletes files.
//
// Usage:
//   npx tsx scripts/analyze-no-entry-files.mts
// Outputs:
//   analysis-output/no-entry-files-report.json  (full machine-readable report)
//   analysis-output/no-entry-files-report.md    (human-readable summary)
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
const DIRS = ['reports', 'zaozhi', 'laiguanxue'];

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
}

interface WikiFileRow {
  id: number;
  entryId: number;
  originalFilename: string;
  sha256: string | null;
  storagePath: string;
}

interface MetaEntry {
  id?: number;
  title: string;
  summary?: string;
  source: string;
}

function collectFiles(): string[] {
  const results: string[] = [];
  for (const dir of DIRS) {
    const root = path.join(DATA_DIR, dir);
    if (!fs.existsSync(root)) continue;
    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) results.push(full);
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

function dirOf(relPath: string): string {
  return relPath.split('/')[0] || '(root)';
}

async function main() {
  const filePaths = collectFiles();
  const files: LocalFile[] = filePaths.map(buildFileInfo);

  const entryRows = await db
    .select({ id: entries.id, title: entries.title, type: entries.entryType, summary: entries.summary })
    .from(entries)
    .where(isNull(entries.deletedAt))
    .orderBy(entries.id);
  const wikiFileRows = await db
    .select({
      id: wikiFiles.id,
      entryId: wikiFiles.entryId,
      originalFilename: wikiFiles.originalFilename,
      sha256: wikiFiles.sha256,
      storagePath: wikiFiles.storagePath,
    })
    .from(wikiFiles);

  const metaEntries: MetaEntry[] = [];
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
      // ignore unreadable metadata snapshot
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
  const sourceExactIndex = new Map<string, EntryRow>();
  for (const src of entrySources) {
    const key = norm(src.base);
    if (!sourceExactIndex.has(key)) sourceExactIndex.set(key, src.entry);
  }

  const matchedByTitle = new Map<string, { entry: EntryRow; reason: string }>();
  // Matched by the exact migration rule (wiki_files.original_filename or entries.title == base).
  const existingRuleMatched = new Map<string, { entry: EntryRow; reason: string }>();
  const filesBySha = new Map<string, LocalFile[]>();
  for (const f of files) {
    const arr = filesBySha.get(f.sha256) ?? [];
    arr.push(f);
    filesBySha.set(f.sha256, arr);
    const fBase = baseName(f.fileName);
    const fVariants = stripSuffixes(fBase);

    // 1. exact title match (same rule as migration script)
    const exact = entryRows.find((e) => e.title === fBase);
    if (exact) {
      matchedByTitle.set(f.relPath, { entry: exact, reason: 'exact_title' });
      existingRuleMatched.set(f.relPath, { entry: exact, reason: 'exact_title' });
      continue;
    }
    // 2. normalized title match
    const normMatch = titleSet.get(norm(fBase)) ?? [];
    if (normMatch.length > 0) {
      matchedByTitle.set(f.relPath, { entry: normMatch[0], reason: 'normalized_title' });
      continue;
    }
    // 3. wiki_files original_filename match
    const wikiMatch = wikiFileRows.find(
      (w) =>
          norm(w.originalFilename) === norm(f.fileName) ||
          norm(path.basename(w.originalFilename, path.extname(w.originalFilename))) === norm(fBase),
    );
    if (wikiMatch) {
      const entry = entryRows.find((e) => e.id === wikiMatch.entryId);
      if (entry) {
        matchedByTitle.set(f.relPath, { entry, reason: 'wiki_file_link' });
        existingRuleMatched.set(f.relPath, { entry, reason: 'wiki_file_link' });
        continue;
      }
    }
    // 4. exact source-file summary match (Imported from pdf/md/path, Auto-imported)
    const sourceExact = sourceExactIndex.get(norm(fBase));
    if (sourceExact) {
      matchedByTitle.set(f.relPath, { entry: sourceExact, reason: 'source_summary' });
    }
  }

  const noEntryFiles = files.filter((f) => !existingRuleMatched.has(f.relPath));
  // First file (by scan order) in each sha256 group that has its own definite match.
  const groupPrimary = new Map<string, string>();
  for (const f of noEntryFiles) {
    const m = matchedByTitle.get(f.relPath);
    if (m && !groupPrimary.has(f.sha256)) groupPrimary.set(f.sha256, f.relPath);
  }
  const report = [];
  for (const f of noEntryFiles) {
    const exactMatch = matchedByTitle.get(f.relPath);
    const base = baseName(f.fileName);
    const variants = stripSuffixes(base);

    // SHA256 duplicate analysis: any file in the same content group matched?
    const dupFiles = (filesBySha.get(f.sha256) ?? []).filter((x) => x.relPath !== f.relPath);
    const dupWithEntry = dupFiles
      .map((df) => {
        const m = matchedByTitle.get(df.relPath);
        return m ? { relPath: df.relPath, entry: m.entry, reason: m.reason } : null;
      })
      .filter((x): x is { relPath: string; entry: EntryRow; reason: string } => x !== null);

    // Variant candidates: entry title equals a suffix-stripped variant.
    const variantCandidates: Array<{ entry: EntryRow; reason: string; score: number }> = [];
    for (const v of variants) {
      const matches = titleSet.get(norm(v)) ?? [];
      for (const e of matches) {
        variantCandidates.push({ entry: e, reason: `title_variant: ${base} -> ${v}`, score: 1 });
      }
    }

    // Source-file variant candidates: entry was imported from a sibling file name
    // (e.g. English original vs -dual translation of the same paper).
    const sourceVariantCandidates: Array<{ entry: EntryRow; reason: string; score: number }> = [];
    for (const src of entrySources) {
      if (norm(src.base) === norm(base)) continue;
      const srcVariants = stripSuffixes(src.base);
      const overlap = srcVariants.some((v) => variants.includes(v) && v.length >= 8);
      if (overlap) {
        sourceVariantCandidates.push({
          entry: src.entry,
          reason: `source_file_variant: ${src.base}`,
          score: 0.9,
        });
      }
    }

    // Patent number candidates.
    const patentNumbersInName = patentNumbers(f.fileName);
    const patentCandidates: Array<{ entry: EntryRow; reason: string; score: number }> = [];
    for (const pn of patentNumbersInName) {
      const key = norm(pn.replace(/\s+/g, ''));
      for (const e of entryRows) {
        if (norm(e.title).includes(key) || norm(e.title).includes(key.replace('.', '.'))) {
          const score = Math.max(0.55, textSimilarity(e.title, base));
          patentCandidates.push({ entry: e, reason: `patent_number: ${pn}`, score });
        }
      }
    }

    // pdf_titles.json candidate.
    const pdfCandidates: Array<{ entry: EntryRow; reason: string; score: number }> = [];
    for (const v of [...new Set([base, ...variants])]) {
      const extracted = pdfTitles[v];
      if (!extracted || extracted.length < 10) continue;
      if (/^(license, which permits|research open access|type original research|procedia manufacturing|extended author information)/i.test(extracted)) continue;
      for (const e of entryRows) {
        const ne = norm(e.title);
        const nx = norm(extracted);
        let s = textSimilarity(e.title, extracted);
        if (nx.length >= 12 && (ne.startsWith(nx) || nx.startsWith(ne))) {
          s = Math.max(s, Math.min(ne.length, nx.length) / Math.max(ne.length, nx.length));
          if (s < 0.6) s = 0.6;
        }
        if (s >= 0.6) {
          pdfCandidates.push({ entry: e, reason: `pdf_title: ${extracted.slice(0, 80)}`, score: s });
        }
      }
    }

    // Journal ID / DOI token candidates (e.g. fenrg-4-1549247 -> DOI in summary).
    const idCandidates: Array<{ entry: EntryRow; reason: string; score: number }> = [];
    for (const token of idTokens(base)) {
      for (const e of entryRows) {
        const haystack = `${norm(e.title)} ${norm(e.summary)}`;
        if (haystack.includes(token)) {
          idCandidates.push({ entry: e, reason: `id_token: ${token}`, score: 0.7 });
        }
      }
    }

    // General fuzzy candidates against all entry titles.
    const fuzzyCandidates: Array<{ entry: EntryRow; reason: string; score: number }> = [];
    for (const e of entryRows) {
      if (variantCandidates.some((c) => c.entry.id === e.id)) continue;
      const s = textSimilarity(e.title, base);
      if (s >= 0.35) {
        fuzzyCandidates.push({ entry: e, reason: 'fuzzy_title', score: s });
      }
    }

    // Metadata JSON candidates (entry exists in old local metadata but maybe not DB).
    const metaCandidates = metaEntries
      .filter((m) => {
        const titleEq = norm(m.title) === norm(base) || variants.some((v) => norm(m.title) === norm(v));
        const summaryHit =
          m.summary && (norm(m.summary).includes(norm(f.fileName)) || norm(m.summary).includes(norm(f.relPath)));
        return titleEq || Boolean(summaryHit);
      })
      .map((m) => ({ ...m, inDb: entryRows.some((e) => e.id === m.id || norm(e.title) === norm(m.title)) }));

    // Metadata entries that still exist in the DB are strong candidates.
    const metadataDbCandidates: Array<{ entry: EntryRow; reason: string; score: number }> = [];
    for (const m of metaCandidates.filter((x) => x.inDb)) {
      const dbEntry =
        entryRows.find((e) => e.id === m.id) ??
        entryRows.find((e) => norm(e.title) === norm(m.title));
      if (dbEntry) {
        metadataDbCandidates.push({
          entry: dbEntry,
          reason: `metadata_in_db: ${m.source}`,
          score: 0.85,
        });
      }
    }

    // Deduplicate candidates by entry id, keep best score.
    const allCandidates = [
      ...variantCandidates,
      ...sourceVariantCandidates,
      ...patentCandidates,
      ...pdfCandidates,
      ...idCandidates,
      ...metadataDbCandidates,
      ...fuzzyCandidates,
    ];
    const bestByEntry = new Map<number, { entry: EntryRow; reason: string; score: number }>();
    for (const c of allCandidates) {
      const prev = bestByEntry.get(c.entry.id);
      if (!prev || c.score > prev.score) bestByEntry.set(c.entry.id, c);
    }
    const candidates = [...bestByEntry.values()].sort((a, b) => b.score - a.score).slice(0, 5);

    let category: 'A' | 'B' | 'C' | 'D' | 'E';
    let categoryReason = '';
    let linkedEntry: EntryRow | null = null;

    const isGroupPrimary = groupPrimary.get(f.sha256) === f.relPath;
    if (exactMatch && isGroupPrimary) {
      category = 'A';
      categoryReason = `definite match: ${exactMatch.reason}`;
      linkedEntry = exactMatch.entry;
    } else if (dupWithEntry.length > 0 || (exactMatch && groupPrimary.has(f.sha256))) {
      category = 'D';
      const linked = exactMatch?.entry ?? dupWithEntry[0]?.entry ?? null;
      categoryReason = `duplicate (same sha256 as primary file) linked to entry #${linked?.id}`;
      linkedEntry = linked;
    } else {
      const top = candidates[0];
      const highConfidence = top && top.score >= 0.65;
      if (highConfidence) {
        category = 'B';
        categoryReason = `high-confidence candidate #${top.entry.id}: ${top.entry.title} (score ${top.score.toFixed(2)})`;
        linkedEntry = top.entry;
      } else if (metaCandidates.some((m) => !m.inDb)) {
        category = 'E';
        categoryReason = `metadata snapshot has a matching entry but DB has no live entry; needs manual confirmation`;
      } else if (candidates.length > 0) {
        category = 'E';
        categoryReason = `weak candidate(s) only (top score ${top ? top.score.toFixed(2) : '0'}); cannot confirm`;
      } else {
        category = 'C';
        categoryReason = 'no entry and no plausible candidate in DB';
      }
    }

    const shouldUpload = category === 'A' || (category === 'D' && linkedEntry !== null);
    report.push({
      relPath: f.relPath,
      fileName: f.fileName,
      dir: dirOf(f.relPath),
      size: f.size,
      sha256: f.sha256,
      exactTitleMatch: Boolean(exactMatch),
      matchReason: exactMatch?.reason ?? null,
      sha256DuplicateCount: dupFiles.length,
      sha256DuplicatesWithEntry: dupWithEntry.map((d) => ({
        relPath: d.relPath,
        entryId: d.entry.id,
        entryTitle: d.entry.title,
        matchReason: d.reason,
      })),
      patentNumbers: patentNumbersInName,
      candidates: candidates.map((c) => ({
        entryId: c.entry.id,
        entryTitle: c.entry.title,
        entryType: c.entry.type,
        score: Number(c.score.toFixed(2)),
        reason: c.reason,
      })),
      metadataMatches: metaCandidates.map((m) => ({
        entryId: m.id ?? null,
        entryTitle: m.title,
        inDb: m.inDb,
        source: m.source,
      })),
      category,
      categoryReason,
      linkedEntryId: linkedEntry?.id ?? null,
      linkedEntryTitle: linkedEntry?.title ?? null,
      shouldUpload,
    });
  }

  const categories = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let withDefiniteEntry = 0;
  let duplicatesOfMatched = 0;
  let orphans = 0;
  for (const r of report) {
    categories[r.category] += 1;
    if (r.category === 'A') withDefiniteEntry += 1;
    if (r.category === 'D' && r.linkedEntryId) duplicatesOfMatched += 1;
    if (r.category === 'C') orphans += 1;
  }

  const uniqueSha = new Set(files.map((f) => f.sha256)).size;
  const uniqueObjectsToUpload = new Set(
    report.filter((r) => r.shouldUpload).map((r) => r.sha256),
  ).size;

  const recommendations = {
    uploadNow: report
      .filter((r) => r.shouldUpload)
      .sort((a, b) => a.relPath.localeCompare(b.relPath))
      .map((r) => ({
        relPath: r.relPath,
        sha256: r.sha256,
        linkedEntryId: r.linkedEntryId,
        linkedEntryTitle: r.linkedEntryTitle,
        category: r.category,
      })),
    needsReview: report
      .filter((r) => r.category === 'B' || r.category === 'E')
      .sort((a, b) => a.relPath.localeCompare(b.relPath))
      .map((r) => ({
        relPath: r.relPath,
        sha256: r.sha256,
        category: r.category,
        reason: r.categoryReason,
      })),
    keepUnlinked: report
      .filter((r) => r.category === 'C' || (r.category === 'D' && !r.linkedEntryId))
      .sort((a, b) => a.relPath.localeCompare(b.relPath))
      .map((r) => ({
        relPath: r.relPath,
        sha256: r.sha256,
        category: r.category,
      })),
  };

  const result = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    summary: {
      scannedFiles: files.length,
      uniqueSha256AllFiles: uniqueSha,
      matchedByExistingRule: existingRuleMatched.size,
      noEntryFiles: report.length,
      categories,
      withDefiniteEntry,
      duplicatesOfMatched,
      orphans,
      uniqueObjectsToUploadNow: uniqueObjectsToUpload,
    },
    recommendations,
    entriesInDb: entryRows.length,
    wikiFilesInDb: wikiFileRows.length,
    files: report,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, 'no-entry-files-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf8');

  const mdLines = [
    '# noEntry 文件只读分析报告',
    '',
    `生成时间: ${result.generatedAt}`,
    '',
    '## 汇总',
    '',
    `- 扫描文件: ${result.summary.scannedFiles}`,
    `- 唯一 SHA256: ${result.summary.uniqueSha256AllFiles}`,
    `- 现有迁移规则可匹配: ${result.summary.matchedByExistingRule}`,
    `- noEntry 文件: ${result.summary.noEntryFiles}`,
    `- 分类: A=${categories.A}, B=${categories.B}, C=${categories.C}, D=${categories.D}, E=${categories.E}`,
    `- 可立即关联并上传: ${result.summary.withDefiniteEntry + result.summary.duplicatesOfMatched} 个文件（${result.summary.uniqueObjectsToUploadNow} 个唯一对象）`,
    `- 需人工确认: ${categories.B + categories.E}`,
    `- 明确孤立原始数据: ${categories.C}`,
    `- 保留未关联: ${recommendations.keepUnlinked.length}`,
    '',
    '## 分类明细',
    '',
    '| 分类 | 文件 | 关联条目 | 说明 |',
    '| --- | --- | --- | --- |',
    ...report.map((r) => {
      const link = r.linkedEntryId ? `#${r.linkedEntryId} ${r.linkedEntryTitle}` : '';
      return `| ${r.category} | ${r.relPath} | ${link} | ${r.categoryReason} |`;
    }),
  ];
  const mdPath = path.join(OUT_DIR, 'no-entry-files-report.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'), 'utf8');

  console.log(JSON.stringify(result.summary, null, 2));
  console.log(`\nReport written to:\n  ${jsonPath}\n  ${mdPath}`);
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
