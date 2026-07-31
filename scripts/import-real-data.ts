// Import real desktop knowledge files into the wiki database.
// Usage:
//   npx tsx scripts/import-real-data.ts [--dry-run] [--max N]
//
// Scans backend/data/{handwritten,laiguanxue,zaozhi}, skips titles that already
// exist in the DB, and runs parse -> chunk -> embed -> vector per missing file.
// PDFs use fast pypdf text extraction with a Docling fallback for scanned files;
// spreadsheets are read with the xlsx package; images and Office docs use Docling.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isNull } from 'drizzle-orm';
import { db } from '../backend/db/connection.js';
import { entries } from '../backend/db/schema.js';
import { importService } from '../backend/services/import.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../backend/data');
const LOG_PATH = path.join(DATA_DIR, 'import-real-data.log');
const DIRS = ['handwritten', 'laiguanxue', 'zaozhi'];

const SUPPORTED = new Set([
  '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.md', '.txt',
  '.csv', '.html', '.htm',
  '.json', '.xml', '.yaml', '.yml', '.log',
]);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const SPREADSHEET_EXTS = new Set(['.xlsx', '.xls']);

const PY_PDF_SCRIPT = [
  'import pypdf, sys',
  'reader = pypdf.PdfReader(sys.argv[1])',
  'pages = [(p.extract_text() or "") for p in reader.pages]',
  'sys.stdout.write(f"# Pages: {len(reader.pages)}\\n\\n")',
  'sys.stdout.write("\\n\\n---\\n\\n".join(pages))',
].join('\n');

interface FileItem {
  file: string;
  rel: string;
}

interface EntryMeta {
  title: string;
  entry_type: string;
  category_id: number;
  tags: string[];
}

function log(msg: string) {
  console.log(msg);
  fs.appendFileSync(LOG_PATH, `${msg}\n`);
}

function collectFiles(): FileItem[] {
  const results: FileItem[] = [];
  for (const dir of DIRS) {
    const root = path.join(DATA_DIR, dir);
    if (!fs.existsSync(root)) continue;

    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (SUPPORTED.has(path.extname(entry.name).toLowerCase())) {
          results.push({ file: full, rel: path.relative(DATA_DIR, full) });
        }
      }
    };
    walk(root);
  }
  return results;
}

function classify(rel: string, fileName: string): EntryMeta {
  const lower = rel.toLowerCase();
  const ext = path.extname(fileName).toLowerCase();
  const title = path.basename(fileName, ext);

  const isPatent = /[\\/]专利[\\/]/.test(lower) || /^(cn|ep|us|jp|pct)/i.test(fileName);
  const isHandwritten = lower.startsWith('handwritten');
  const isZaozhi = lower.includes('zaozhi');
  const isLaiGuanXue = lower.includes('laiguanxue');
  const isTranslation = /-dual/i.test(fileName) || /[\\/]翻译[\\/]/.test(lower);

  let entry_type: string;
  let category_id: number;
  if (isPatent) {
    entry_type = 'patent';
    category_id = 4;
  } else if (isHandwritten) {
    entry_type = 'handwritten_note';
    category_id = 6;
  } else if (ext === '.pptx' || ext === '.ppt') {
    entry_type = 'template';
    category_id = 1;
  } else if (SPREADSHEET_EXTS.has(ext) || ext === '.csv' || ext === '.txt' || ext === '.md') {
    entry_type = 'data_standard';
    category_id = 5;
  } else if (ext === '.html' || ext === '.htm') {
    entry_type = 'tech_doc';
    category_id = 3;
  } else if (IMAGE_EXTS.has(ext)) {
    entry_type = 'business_material';
    category_id = 2;
  } else if (ext === '.docx' || ext === '.doc') {
    entry_type = 'business_material';
    category_id = 2;
  } else {
    entry_type = 'academic_paper';
    category_id = 3;
  }

  const tags = new Set<string>();
  if (isZaozhi) tags.add('造纸');
  if (isLaiGuanXue) tags.add('来关学');
  if (isHandwritten) tags.add('手写笔记');
  if (isPatent) tags.add('专利');
  if (isTranslation) tags.add('翻译文档');
  if (isLaiGuanXue || /mof/i.test(fileName)) tags.add('MOF');

  return { title, entry_type, category_id, tags: [...tags] };
}

function extractPdfText(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-c', PY_PDF_SCRIPT, filePath], {
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) resolve(stdout);
      else reject(new Error(stderr.trim() || `pypdf exited with code ${code}`));
    });
  });
}

async function extractSpreadsheet(filePath: string): Promise<string> {
  const mod = await import('xlsx');
  const XLSX = mod.default || mod;
  const workbook = XLSX.readFile(filePath);
  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as unknown[][];
    lines.push(`## ${sheetName}`);
    if (rows.length > 0) {
      const header = rows[0].map((v) => String(v ?? '')).join(' | ');
      lines.push(`| ${header} |`);
      lines.push(`| ${rows[0].map(() => '---').join(' | ')} |`);
      for (let i = 1; i < Math.min(rows.length, 500); i++) {
        lines.push(`| ${rows[i].map((v) => String(v ?? '')).join(' | ')} |`);
      }
      if (rows.length > 500) lines.push(`| ... 共 ${rows.length} 行 ... |`);
    }
  }
  return lines.join('\n');
}

function metaFor(rel: string, fileName: string): EntryMeta {
  const meta = classify(rel, fileName);
  return {
    ...meta,
    summary: `Imported from ${rel}`,
  } as EntryMeta;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const maxFlag = process.argv.find((a) => a.startsWith('--max='));
  const maxFiles = maxFlag ? Number(maxFlag.split('=')[1]) : Number.POSITIVE_INFINITY;

  const existingRows = await db
    .select({ title: entries.title })
    .from(entries)
    .where(isNull(entries.deletedAt));
  const existing = new Set(existingRows.map((r) => r.title));

  const seen = new Set<string>();
  const todo: FileItem[] = [];
  for (const item of collectFiles()) {
    const title = path.basename(item.file, path.extname(item.file));
    if (existing.has(title) || seen.has(title)) continue;
    seen.add(title);
    todo.push(item);
  }

  log(`[RealDataImport] ${collectFiles().length} files found, ${todo.length} missing from DB${dryRun ? ' (dry run)' : ''}`);
  if (dryRun) {
    todo.slice(0, 20).forEach((f) => log(`  ${path.basename(f.file)} -> ${classify(f.rel, path.basename(f.file)).entry_type}`));
    log(`[RealDataImport] Dry run complete: would import ${todo.length} files`);
    process.exit(0);
  }

  const filesToRun = todo.slice(0, maxFiles);
  let ok = 0;
  let fail = 0;
  const start = Date.now();

  for (let i = 0; i < filesToRun.length; i++) {
    const { file, rel } = filesToRun[i];
    const meta = classify(rel, path.basename(file));
    const ext = path.extname(file).toLowerCase();
    const t0 = Date.now();

    try {
      let result;
      if (ext === '.pdf') {
        try {
          const markdown = await extractPdfText(file);
          if (markdown.trim().length >= 50) {
            result = await importService.importFromApi(markdown, `${meta.title}.md`, meta as any, {
              chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 },
            });
          } else {
            throw new Error('pypdf produced no readable text; falling back to Docling');
          }
        } catch {
          try {
            result = await importService.import({
              mode: 'batch',
              source: file,
              fileName: path.basename(file),
              entryMetadata: meta as any,
              chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 },
            });
            if (!result.success) {
              // Scanned PDFs without OCR text still get a searchable stub entry.
              const stub = `# ${meta.title}\n\n原始文件：${rel}\n\n该 PDF 未能自动提取文本（可能为扫描件）。\n`;
              result = await importService.importFromApi(stub, `${meta.title}.md`, meta as any, {
                chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 },
              });
            }
          } catch {
            const stub = `# ${meta.title}\n\n原始文件：${rel}\n\n该 PDF 未能自动提取文本（可能为扫描件）。\n`;
            result = await importService.importFromApi(stub, `${meta.title}.md`, meta as any, {
              chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 },
            });
          }
        }
      } else if (SPREADSHEET_EXTS.has(ext)) {
        const markdown = await extractSpreadsheet(file);
        result = await importService.importFromApi(markdown, `${meta.title}.md`, meta as any, {
          chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 },
        });
      } else {
        result = await importService.import({
          mode: 'batch',
          source: file,
          fileName: path.basename(file),
          entryMetadata: meta as any,
          chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 },
        });
      }

      const ms = Date.now() - t0;
      if (result.success) {
        ok++;
        log(`[RealDataImport] OK ${i + 1}/${filesToRun.length} #${result.entryId} ${meta.title} (${ms}ms)`);
      } else {
        fail++;
        log(`[RealDataImport] PARTIAL ${i + 1}/${filesToRun.length} #${result.entryId} ${meta.title} errors=${result.errors.length} (${ms}ms)`);
        for (const e of result.errors.slice(0, 3)) log(`    ${e}`);
      }
    } catch (err: any) {
      fail++;
      log(`[RealDataImport] FAIL ${i + 1}/${filesToRun.length} ${meta.title}: ${err.message}`);
    }

    if ((i + 1) % 10 === 0) {
      log(`[RealDataImport] Progress ${i + 1}/${filesToRun.length} | ok=${ok} fail=${fail} | ${Math.round((Date.now() - start) / 1000)}s elapsed`);
    }
  }

  log(`[RealDataImport] Done: ${ok} ok, ${fail} failed, ${Math.round((Date.now() - start) / 1000)}s total`);
  process.exit(0);
}

main().catch((err) => {
  log(`[RealDataImport] Fatal: ${err.message}`);
  process.exit(1);
});
