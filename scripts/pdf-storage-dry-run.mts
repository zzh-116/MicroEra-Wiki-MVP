// Read-only PDF storage dry-run: scans backend/data/{reports,zaozhi,laiguanxue},
// computes SHA-256 and simulated object keys, and writes a Markdown report plus
// a machine-readable review JSON. Never uploads, never writes PostgreSQL, and
// never connects to MinIO.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { and, inArray, isNull } from 'drizzle-orm';
import { db } from '../backend/db/connection.js';
import { entries } from '../backend/db/schema.js';
import {
  buildConfirmedEntryMap,
  objectKeyFor,
} from '../backend/services/file-migration.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../backend/data');
const OUT_DIR = path.resolve(__dirname, '../analysis-output');
const AUDIT_PATH = path.join(OUT_DIR, 'entry-file-audit.json');
const DIRS = ['reports', 'zaozhi', 'laiguanxue'];

interface PdfInfo {
  absolutePath: string;
  relPath: string;
  fileName: string;
  ext: string;
  size: number;
  sha256: string;
}

function collectPdfPaths(): string[] {
  const results: string[] = [];
  for (const dir of DIRS) {
    const root = path.join(DATA_DIR, dir);
    if (!fs.existsSync(root)) continue;
    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.toLowerCase().endsWith('.pdf')) results.push(full);
      }
    };
    walk(root);
  }
  return results.sort();
}

function sha256Of(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function buildPdfInfo(filePath: string): PdfInfo {
  const stat = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  return {
    absolutePath: filePath,
    relPath: path.relative(DATA_DIR, filePath).replace(/\\/g, '/'),
    fileName,
    ext: path.extname(fileName).toLowerCase(),
    size: stat.size,
    sha256: sha256Of(filePath),
  };
}

function loadAudit(): unknown {
  if (!fs.existsSync(AUDIT_PATH)) {
    throw new Error(`Missing audit report: ${AUDIT_PATH}`);
  }
  return JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
}

function keyOf(pdf: PdfInfo): string {
  return objectKeyFor(pdf.sha256, pdf.ext);
}

async function main() {
  const before = new Map<string, { size: number; mtimeMs: number }>();
  const pdfs = collectPdfPaths().map((p) => {
    const stat = fs.statSync(p);
    before.set(p, { size: stat.size, mtimeMs: stat.mtimeMs });
    return buildPdfInfo(p);
  });

  const audit = loadAudit();
  const auditMap = buildConfirmedEntryMap(audit as Parameters<typeof buildConfirmedEntryMap>[0]);
  const candidateIds = [...new Set([...auditMap.values()].flat())];
  const liveEntryIds = new Set<number>();
  if (candidateIds.length > 0) {
    const rows = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(inArray(entries.id, candidateIds), isNull(entries.deletedAt)));
    for (const row of rows) liveEntryIds.add(row.id);
  }

  const entryIdsByRelPath = new Map<string, number[]>();
  for (const pdf of pdfs) {
    const ids = (auditMap.get(pdf.relPath) ?? []).filter((id) => liveEntryIds.has(id));
    entryIdsByRelPath.set(pdf.relPath, ids);
  }

  const uniqueSha256 = new Set(pdfs.map((p) => p.sha256));
  const matched = pdfs.filter((p) => (entryIdsByRelPath.get(p.relPath) ?? []).length > 0);
  const unmatched = pdfs.filter((p) => (entryIdsByRelPath.get(p.relPath) ?? []).length === 0);
  const pdfMultiEntry = matched.filter((p) => (entryIdsByRelPath.get(p.relPath) ?? []).length > 1);

  const entryToPdfs = new Map<number, Set<string>>();
  for (const pdf of matched) {
    for (const entryId of entryIdsByRelPath.get(pdf.relPath) ?? []) {
      const set = entryToPdfs.get(entryId) ?? new Set<string>();
      set.add(pdf.relPath);
      entryToPdfs.set(entryId, set);
    }
  }
  const entriesWithMultiplePdfs = [...entryToPdfs.values()].filter((s) => s.size > 1).length;

  const keysByRelPath = new Map<string, string[]>();
  for (const pdf of matched) {
    const key = keyOf(pdf);
    const rels = keysByRelPath.get(key) ?? [];
    rels.push(pdf.relPath);
    keysByRelPath.set(key, rels);
  }
  const objectKeyDuplicates = [...keysByRelPath.entries()]
    .filter(([, rels]) => rels.length > 1)
    .map(([key, rels]) => ({ objectKey: key, relPaths: rels }));

  const simulatedRows = matched.flatMap((pdf) =>
    (entryIdsByRelPath.get(pdf.relPath) ?? []).map((entryId) => ({
      entryId,
      fileName: pdf.fileName,
      relPath: pdf.relPath,
      objectKey: keyOf(pdf),
    })),
  );

  const entryFilenameGroups = new Map<string, { entryId: number; fileName: string; relPaths: string[] }>();
  for (const row of simulatedRows) {
    const groupKey = `${row.entryId}|${row.fileName}`;
    const group = entryFilenameGroups.get(groupKey) ?? {
      entryId: row.entryId,
      fileName: row.fileName,
      relPaths: [],
    };
    group.relPaths.push(row.relPath);
    entryFilenameGroups.set(groupKey, group);
  }
  const entryFilenameDuplicates = [...entryFilenameGroups.values()].filter((g) => g.relPaths.length > 1);

  let previousManifestKeyOverlap = 0;
  const manifestPath = path.join(OUT_DIR, 'pdf-migration-manifest.csv');
  if (fs.existsSync(manifestPath)) {
    const manifestText = fs.readFileSync(manifestPath, 'utf8');
    const previousKeys = new Set(
      [...manifestText.matchAll(/documents\/[0-9a-f]{64}\.pdf/g)].map((m) => m[0]),
    );
    previousManifestKeyOverlap = [...previousKeys].filter((key) => keysByRelPath.has(key)).length;
  }

  const afterUnchanged = pdfs.every((pdf) => {
    const beforeStat = before.get(pdf.absolutePath);
    if (!beforeStat) return false;
    const current = fs.statSync(pdf.absolutePath);
    return current.size === beforeStat.size && current.mtimeMs === beforeStat.mtimeMs;
  });

  const stats = {
    pdfTotal: pdfs.length,
    uniqueSha256: uniqueSha256.size,
    matchedPdfCount: matched.length,
    unmatchedPdfCount: unmatched.length,
    pdfMultiEntryCount: pdfMultiEntry.length,
    entriesWithMultiplePdfs,
    expectedWikiFilesRows: simulatedRows.length,
    expectedUniqueObjects: keysByRelPath.size,
    uniqueObjectKeysAllPdfs: new Set(pdfs.map(keyOf)).size,
    duplicateObjectKeyCount: objectKeyDuplicates.length,
    entryFilenameDuplicateCount: entryFilenameDuplicates.length,
    previousManifestKeyOverlap,
    sourceFilesUnchanged: afterUnchanged,
    byDir: Object.fromEntries(
      DIRS.map((dir) => [
        dir,
        pdfs.filter((p) => p.relPath.startsWith(`${dir}/`)).length,
      ]),
    ),
  };

  const review = unmatched.map((pdf) => ({
    relPath: pdf.relPath,
    fileName: pdf.fileName,
    sha256: pdf.sha256,
    size: pdf.size,
    reason: 'no_high_confidence_entry',
  }));

  const reportJson = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    scope: { dataDir: DATA_DIR, dirs: DIRS },
    stats,
    objectKeyDuplicates,
    entryFilenameDuplicates: entryFilenameDuplicates.map((g) => ({
      entryId: g.entryId,
      fileName: g.fileName,
      relPaths: g.relPaths,
    })),
    review,
    warnings: [
      'MinIO was not contacted; actual bucket object state was not verified.',
      'previousManifestKeyOverlap is based on analysis-output/pdf-migration-manifest.csv, not live MinIO state.',
    ],
  };

  const mdLines = [
    '# PDF 存储 dry-run 报告',
    '',
    `生成时间: ${reportJson.generatedAt}`,
    `扫描目录: ${DIRS.join(', ')}`,
    '',
    '## 统计',
    '',
    `- PDF 总数: ${stats.pdfTotal}`,
    `- 唯一 SHA256: ${stats.uniqueSha256}`,
    `- 高置信匹配 PDF 数: ${stats.matchedPdfCount}`,
    `- 无法高置信匹配 PDF 数: ${stats.unmatchedPdfCount}`,
    `- PDF 对应多个 entry 的数量: ${stats.pdfMultiEntryCount}`,
    `- entry 对应多个 PDF 的数量: ${stats.entriesWithMultiplePdfs}`,
    `- 预计 wiki_files 行数: ${stats.expectedWikiFilesRows}`,
    `- 预计唯一 MinIO objects 数: ${stats.expectedUniqueObjects}`,
    `- 重复 object key 组数: ${stats.duplicateObjectKeyCount}`,
    `- 重复 (entry_id, original_filename) 组数: ${stats.entryFilenameDuplicateCount}`,
    `- 源 PDF 保持不变: ${stats.sourceFilesUnchanged}`,
    '',
    '## 重复 object key',
    '',
    ...(objectKeyDuplicates.length === 0
      ? ['无。']
      : objectKeyDuplicates.map(
          (d) => `- ${d.objectKey}: ${d.relPaths.join(', ')}`,
        )),
    '',
    '## 重复 (entry_id, original_filename)',
    '',
    ...(entryFilenameDuplicates.length === 0
      ? ['无。']
      : entryFilenameDuplicates.map(
          (g) => `- entry ${g.entryId} / ${g.fileName}: ${g.relPaths.join(', ')}`,
        )),
    '',
    '## Review 清单（无法高置信匹配）',
    '',
    ...(review.length === 0
      ? ['无。']
      : review.map((r) => `- ${r.relPath} (${r.reason})`)),
    '',
    '## 说明',
    '',
    '- 未连接 MinIO，实际 bucket 对象状态未检查。',
    '- previousManifestKeyOverlap 来自 analysis-output/pdf-migration-manifest.csv，不代表实际已上传对象。',
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'pdf-storage-dry-run-report.md'),
    mdLines.join('\n') + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'pdf-storage-review.json'),
    JSON.stringify(reportJson, null, 2) + '\n',
    'utf8',
  );

  console.log(JSON.stringify({ readOnly: true, ...stats, reviewCount: review.length }, null, 2));
  await db.$client.end();
}

main().catch(async (err) => {
  console.error('PDF_DRY_RUN_FAILED:', (err as Error).message);
  try {
    await db.$client.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
