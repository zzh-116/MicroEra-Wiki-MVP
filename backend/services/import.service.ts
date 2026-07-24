// Import Service — enterprise data pipeline with transactional safety
// Depends on DocumentParser interface — parser implementation is swappable
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/connection.js';
import { entryRepository, CreateEntryInput } from '../repositories/entry.repository.js';
import { chunkRepository } from '../repositories/chunk.repository.js';
import { vectorRepository } from '../repositories/vector.repository.js';
import { getParser } from '../parser/index.js';
import type { DocumentParser, InputFormat, ParseResult } from '../parser/types.js';
import { ParserError } from '../parser/types.js';
import { chunkService, ChunkConfig } from '../chunk/service.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import type { ParsedProperty, Entry } from '../types.js';
import { config } from '../config.js';
import type { Document } from '../connectors/types.js';
import { findSyncedEntry, recordSync } from './sync-log.service.js';

export type ImportMode = 'upload' | 'api' | 'batch';

export interface ImportInput {
  mode: ImportMode;
  source: string;
  content?: string;
  buffer?: Buffer;
  fileName?: string;
  entryMetadata?: {
    title?: string;
    entry_type?: Entry['entry_type'];
    summary?: string;
    visibility?: Entry['visibility'];
    category_id?: number;
    tags?: string[];
  };
  chunkConfig?: Partial<ChunkConfig>;
  skipEmbedding?: boolean;
}

export interface ImportResult {
  success: boolean;
  mode: ImportMode;
  source: string;
  entryId: number;
  parse: { sourceFormat: InputFormat; fileName: string; fileSize: number; wordCount: number; propertyCount: number; warnings: string[]; parseMs: number };
  chunks: { count: number; strategy: string; chunkMs: number };
  embedding: { model: string; vectorCount: number; dimension: number; skipped: boolean; embedMs: number };
  vector: { store: string; inserted: number };
  timing: { totalMs: number };
  /** Human-readable stage results */
  stages: StageResult[];
  errors: string[];
}

export interface StageResult {
  stage: string;
  status: 'success' | 'failed' | 'skipped';
  ms: number;
  detail: string;
}

export interface BatchImportResult {
  total: number; succeeded: number; failed: number;
  results: ImportResult[]; totalTimeMs: number;
}

const RETRY_MAX = 3;
const RETRY_BASE_MS = 500;

export class ImportService {
  private get parser(): DocumentParser { return getParser(); }

  async import(input: ImportInput): Promise<ImportResult> {
    const t0 = Date.now();
    const stages: StageResult[] = [];
    const errors: string[] = [];

    // ── Stage 1: Parse (with retry) ──
    const parseResult = await this.retryParse(input, stages, errors);
    if (!parseResult) {
      return this.buildResult(input, stages, errors, 0, t0);
    }

    const properties = parseResult.properties || [];
    const title = input.entryMetadata?.title
      || parseResult.metadata.fileName.replace(/\.[^.]+$/, '')
      || `Import ${Date.now()}`;

    let entryContent = parseResult.markdown;
    if (properties.length > 0 && !entryContent.includes('|')) {
      entryContent = this.buildPropertyTable(properties);
    }

    // ── Stage 2: Entry + Chunks (transactional) ──
    let entry: Entry | null = null;
    let chunks: ReturnType<typeof chunkService.chunk> = [];

    try {
      const txn = await db.transaction(async (tx) => {
        const tChunk = Date.now();
        const e = await entryRepository.create({
          title,
    entry_type: input.entryMetadata?.entry_type || 'handwritten_note',
          summary: input.entryMetadata?.summary
            || `Imported from ${parseResult.sourceFormat}: ${parseResult.metadata.fileName}`,
          content: entryContent.slice(0, 50000),
          visibility: input.entryMetadata?.visibility || 'internal',
          category_id: input.entryMetadata?.category_id || 5,
          tags: input.entryMetadata?.tags || this.inferTags(parseResult, properties),
        }, tx as any);

        // Normalize CRLF → LF before chunking. Docling outputs \r\n on Windows,
        // and the chunk service heading regex uses `.` which doesn't match \r,
        // causing ALL heading metadata to be lost (heading=undefined for every chunk).
        const hasCRLF = entryContent.includes('\r\n');
        const normalizedContent = entryContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (hasCRLF) {
          console.log(`[Import] Normalized CRLF → LF in entry content (${entryContent.length} chars)`);
        }

        const c = chunkService.chunk(normalizedContent, `entry_${e.id}`,
          input.chunkConfig || { strategy: 'markdown', chunkSize: 512, overlap: 64 });

        // Persist ALL chunks to DB so vector search can retrieve full chunk text.
        // Delete old chunks first, then append document chunks + property chunks
        // atomically. (Previously only property chunks were saved; regular document
        // chunks were embedded but never stored, so search degraded to
        // entry.content.slice(0,1024) — useless for long documents.)
        await chunkRepository.deleteByEntryId(e.id, tx as any);

        await chunkRepository.saveChunks(e.id, c.map((ch) => ({
          id: ch.id,
          text: ch.text,
          metadata: { strategy: ch.metadata.strategy, heading: ch.metadata.heading, startChar: ch.startChar, endChar: ch.endChar },
        })), { deleteExisting: false }, tx as any);

        if (properties.length > 0) {
          await chunkRepository.saveFromProperties(e.id, properties,
            { deleteExisting: false }, tx as any);
        }

        const chunkMs = Date.now() - tChunk;
        stages.push({ stage: 'chunk', status: 'success', ms: chunkMs,
          detail: `${c.length} chunks (${input.chunkConfig?.strategy || 'markdown'})` });
        console.log(`[Import] Chunk | entry=${e.id} | chunks=${c.length} | ms=${chunkMs} | SUCCESS`);

        return { entry: e, chunks: c };
      });

      entry = txn.entry;
      chunks = txn.chunks;
    } catch (err: any) {
      // Extract full PostgreSQL/Drizzle error details
      const errDetail = [
        err.message,
        err.code ? `SQLSTATE: ${err.code}` : '',
        err.detail ? `Detail: ${err.detail}` : '',
        err.constraint ? `Constraint: ${err.constraint}` : '',
        err.column ? `Column: ${err.column}` : '',
        err.table ? `Table: ${err.table}` : '',
      ].filter(Boolean).join(' | ');

      errors.push(`Entry/Chunk: ${errDetail}`);
      stages.push({ stage: 'chunk', status: 'failed', ms: 0, detail: errDetail });
      // Dig into nested error (Drizzle wraps pg errors in `cause`)
      const pgErr = err.cause || err;
      console.error(`[Import] Entry/Chunk FAILED:
  Message: ${err.message}
  Code: ${err.code || pgErr.code || 'N/A'}
  Detail: ${err.detail || pgErr.detail || 'N/A'}
  Constraint: ${err.constraint || pgErr.constraint || 'N/A'}
  Column: ${err.column || pgErr.column || 'N/A'}
  Table: ${err.table || pgErr.table || 'N/A'}
  cause.Message: ${pgErr.message || 'N/A'}
  cause.Code: ${pgErr.code || 'N/A'}`);
      return this.buildResult(input, stages, errors, 0, t0);
    }

    // ── Stage 3: Embed + Vector ──
    let vectorCount = 0;
    let dimension = 0;
    let skipped = input.skipEmbedding || false;
    const tEmbed = Date.now();

    if (!skipped && chunks.length > 0) {
      try {
        const texts = chunks.map((c) => c.text);
        const { vectors, failed } = await ollamaEmbedder.embedBatch(texts);
        const valid = vectors.filter((v) => v.length > 0);

        // Record every failed chunk so the user knows what's missing
        for (const f of failed) {
          const chunk = chunks[f.index];
          errors.push(`Embedding: chunk #${f.index}${chunk ? ` (${chunk.id})` : ''} — ${f.error}`);
          console.error(`[Import] Embed | entry=${entry!.id} | chunk=${f.index}${chunk ? ` id=${chunk.id}` : ''} | FAILED: ${f.error}`);
        }

        if (valid.length > 0) {
          dimension = valid[0].length;
          const records = chunks.map((c, i) => ({
            chunk_id: c.id, entry_id: entry.id, embedding: vectors[i] || [],
          }));
          await vectorRepository.insert(records);
          vectorCount = valid.length;
        }

        const embedMs = Date.now() - tEmbed;

        if (failed.length === 0) {
          // Complete success — all chunks embedded
          stages.push({ stage: 'embed', status: 'success', ms: embedMs,
            detail: `${vectorCount} vectors (${config.ollama.embeddingModel})` });
          console.log(`[Import] Embed | entry=${entry.id} | vectors=${vectorCount} | ms=${embedMs} | SUCCESS`);
        } else if (valid.length === 0) {
          // Complete failure — no chunks embedded
          stages.push({ stage: 'embed', status: 'failed', ms: embedMs,
            detail: `0/${chunks.length} embedded — ${failed.length} chunks failed` });
        } else {
          // Partial success — some chunks embedded, some failed
          stages.push({ stage: 'embed', status: 'success', ms: embedMs,
            detail: `${vectorCount}/${chunks.length} vectors — ${failed.length} chunks failed (${config.ollama.embeddingModel})` });
          console.log(`[Import] Embed | entry=${entry.id} | vectors=${vectorCount}/${chunks.length} | failed=${failed.length} | ms=${embedMs} | PARTIAL`);
        }
      } catch (err: any) {
        errors.push(`Embedding: ${err.message}`);
        stages.push({ stage: 'embed', status: 'failed', ms: Date.now() - tEmbed, detail: err.message });
        console.error(`[Import] Embed | FAILED: ${err.message}`);
      }
    } else {
      stages.push({ stage: 'embed', status: 'skipped', ms: 0,
        detail: skipped ? 'skipEmbedding=true' : 'no chunks to embed' });
    }

    return this.buildResult(input, stages, errors, entry!.id, t0);
  }

  /** Retry parse up to RETRY_MAX times with exponential backoff */
  private async retryParse(
    input: ImportInput, stages: StageResult[], errors: string[],
  ): Promise<ParseResult | null> {
    let lastErr: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
      const tParse = Date.now();
      try {
        let result: ParseResult;
        if (input.buffer && input.fileName) {
          result = await this.parser.parseBuffer(input.buffer, input.fileName, { extractProperties: true });
        } else if (input.content) {
          result = await this.parser.parseString(input.content, input.fileName || 'api_import.md', { extractProperties: true });
        } else if (input.source) {
          result = await this.parser.parseFile(input.source, { extractProperties: true });
        } else {
          throw new Error('No input provided — need buffer, content, or source path');
        }

        const parseMs = Date.now() - tParse;
        stages.push({ stage: 'parse', status: 'success', ms: parseMs,
          detail: `${result.sourceFormat} → ${result.metadata.wordCount} words (attempt ${attempt})` });
        console.log(`[Import] Parse | file=${result.metadata.fileName} | format=${result.sourceFormat} | ms=${parseMs} | SUCCESS`);
        return result;
      } catch (err: any) {
        lastErr = err;
        const parseMs = Date.now() - tParse;

        if (attempt < RETRY_MAX && this.isRetryable(err)) {
          const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
          console.warn(`[Import] Parse | attempt ${attempt}/${RETRY_MAX} FAILED, retry in ${delay}ms: ${err.message}`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        const detail = err instanceof ParserError
          ? `[${err.code}] ${err.message}${err.suggestion ? ` — ${err.suggestion}` : ''}`
          : err.message;
        errors.push(`Parse: ${detail}`);
        stages.push({ stage: 'parse', status: 'failed', ms: parseMs, detail });
        console.error(`[Import] Parse | FAILED (attempt ${attempt}): ${detail}`);
        return null;
      }
    }

    return null;
  }

  private isRetryable(err: Error): boolean {
    if (err instanceof ParserError) {
      // Don't retry permanent errors
      const nonRetryable = ['FILE_NOT_FOUND', 'EMPTY_FILE', 'UNSUPPORTED_FORMAT', 'EMPTY_CONTENT', 'EMPTY_BUFFER', 'BINARY_REQUIRES_FILE', 'EMPTY_OUTPUT', 'ENCRYPTED', 'CORRUPTED'];
      return !nonRetryable.includes(err.code);
    }
    return true; // Unknown errors are retryable
  }

  /**
   * Import a Document produced by a Connector — skips the parser stage entirely.
   * The connector has already produced unified Markdown content.
   * This method goes straight to: entry → chunk → embed → vector.
   */
  async importFromConnector(doc: Document): Promise<ImportResult> {
    const t0 = Date.now();
    const stages: StageResult[] = [];
    const errors: string[] = [];

    // ── Idempotency check: skip if already imported ──
    const existingEntryId = await findSyncedEntry(doc.source, doc.id);
    if (existingEntryId !== null) {
      stages.push({ stage: 'parse', status: 'skipped', ms: 0, detail: `already imported — entry #${existingEntryId}` });
      const result = this.buildResult(
        { mode: 'api', source: `${doc.source}:${doc.id}`, content: doc.content, fileName: `${doc.title}.md` },
        stages, errors, existingEntryId, t0,
      );
      return { ...result, success: true };
    }

    // Map connector document types to Wiki entry types
    // Frontend filter mapping: paper → tech, project → product, data_item → data_item
    const entryTypeMap: Record<string, string> = {
      // Sandbox asset types → product (shows as "Sandbox 项目")
      operator: 'product',
      dot: 'product',
      dataset: 'product',
      post: 'product',
      // Sandbox wiki/task → product
      wiki: 'product',
      task: 'product',
      // Literature import types → tech (shows as "学术论文")
      preprint: 'tech',        // arXiv
      academic_paper: 'tech',  // CrossRef
    };
    const entryType = (entryTypeMap[doc.type] || 'product') as Entry['entry_type'];

    // Map Sandbox project → Wiki category.
    // TODO: Populate this map from config or DB so each Sandbox project lands in its
    //       own Wiki category. Until then all imports go to category 1 (首页).
    // Example: { '155': 2, '200': 3 }
    const projectCategoryMap: Record<string, number> = {};
    const categoryId = (doc.metadata?.projectId && projectCategoryMap[String(doc.metadata.projectId)])
      || 1;

    // Build import input so we can reuse the existing pipeline logic
    const input: ImportInput = {
      mode: 'api',
      source: `${doc.source}:${doc.id}`,
      content: doc.content,
      fileName: `${doc.title}.md`,
      entryMetadata: {
        title: doc.title,
        entry_type: entryType,
        summary: doc.description || `Imported from ${doc.source}: ${doc.title}`,
        // Sandbox content MUST be internal — never public
        visibility: 'internal',
        tags: [...new Set([doc.source, ...(doc.tags || [])])],
        category_id: categoryId,
      },
      chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 },
    };

    // Mark parse as "skipped" (connector provided structured data)
    stages.push({ stage: 'parse', status: 'skipped', ms: 0, detail: `connector:${doc.source} — structured data, no parser needed` });
    console.log(`[Import] Connector | source=${doc.source} | id=${doc.id} | title=${doc.title}`);

    // Reuse the existing import pipeline (entry → chunk → embed → vector)
    const result = await this.import(input);

    // Record sync log so auto-sync on next restart skips this document
    if (result.success && result.entryId > 0) {
      try {
        await recordSync(doc.source, doc.id, result.entryId, doc.title);
      } catch (err: any) {
        console.error(`[Import] Failed to record sync log for ${doc.source}:${doc.id}: ${err.message}`);
      }
    }

    return result;
  }

  async importBatch(dirPath: string, globPattern = '*', options: { skipEmbedding?: boolean; chunkConfig?: Partial<ChunkConfig> } = {}): Promise<BatchImportResult> {
    const t0 = Date.now();
    const results: ImportResult[] = [];
    if (!fs.existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);
    const files = this.globFiles(dirPath, globPattern);
    console.log(`[Import] Batch: ${files.length} files`);

    for (const file of files) {
      try {
        results.push(await this.import({ mode: 'batch', source: file, fileName: path.basename(file), ...options }));
      } catch (err: any) {
        results.push(this.buildResult({ mode: 'batch', source: file }, [], [err.message], 0, t0));
      }
    }
    return {
      total: files.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results, totalTimeMs: Date.now() - t0,
    };
  }

  async importFromApi(content: string, fileName: string, metadata?: ImportInput['entryMetadata'], options?: { skipEmbedding?: boolean; chunkConfig?: Partial<ChunkConfig> }) {
    return this.import({ mode: 'api', source: `api:${fileName}`, content, fileName, entryMetadata: metadata, ...options });
  }

  async importFromUpload(buffer: Buffer, fileName: string, metadata?: ImportInput['entryMetadata'], options?: { skipEmbedding?: boolean; chunkConfig?: Partial<ChunkConfig> }) {
    return this.import({ mode: 'upload', source: `upload:${fileName}`, buffer, fileName, entryMetadata: metadata, ...options });
  }

  getSupportedFormats() {
    return this.parser.getCapabilities();
  }

  // ---- Helpers ----

  private buildResult(
    input: ImportInput, stages: StageResult[], errors: string[],
    entryId: number, startTime: number,
  ): ImportResult {
    const parse = stages.find((s) => s.stage === 'parse');
    const chunk = stages.find((s) => s.stage === 'chunk');
    const embed = stages.find((s) => s.stage === 'embed');

    return {
      success: !stages.some((s) => s.status === 'failed'),
      mode: input.mode, source: input.source, entryId,
      parse: {
        sourceFormat: 'txt', fileName: input.fileName || input.source, fileSize: 0,
        wordCount: 0, propertyCount: 0, warnings: [],
        parseMs: parse?.ms || 0,
      },
      chunks: { count: chunk?.status === 'success' ? parseInt(chunk.detail) || 0 : 0,
        strategy: input.chunkConfig?.strategy || 'markdown', chunkMs: chunk?.ms || 0 },
      embedding: { model: config.ollama.embeddingModel, vectorCount: 0, dimension: 0,
        skipped: embed?.status === 'skipped', embedMs: embed?.ms || 0 },
      vector: { store: 'pgvector', inserted: 0 },
      timing: { totalMs: Date.now() - startTime },
      stages, errors,
    };
  }

  private buildPropertyTable(props: ParsedProperty[]): string {
    let md = `# 材料性质数据元信息\n\n> 自动导入，共 ${props.length} 个属性定义\n\n`;
    md += `| # | 中文名称 | 英文名称 | 符号 | 定义 | 首选单位 | 其他单位 | 值域 | 方法 | 备注 |\n|---|---------|---------|------|------|---------|---------|------|------|------|\n`;
    for (const p of props) {
      md += `| ${p.code} | ${p.nameZh} | ${p.nameEn} | ${p.symbol} | ${p.definition} | ${p.preferredUnit} | ${p.alternativeUnits || '—'} | ${p.valueRange || '—'} | ${p.methods || '—'} | ${p.notes || '—'} |\n`;
    }
    return md;
  }

  private inferTags(parseResult: ParseResult, props: ParsedProperty[]): string[] {
    const t = new Set<string>();
    if (parseResult.sourceFormat !== 'md') t.add(parseResult.sourceFormat.toUpperCase());
    for (const p of props) {
      if (p.category === 'computational') t.add('DFT');
      if (p.category === 'experimental') t.add('实验数据');
      if (p.category === 'cross') t.add('交叉数据');
      if (p.category === 'condition') t.add('条件参数');
      if (p.methods.includes('吸附')) t.add('吸附分离');
      if (p.methods.includes('传感') || p.section.includes('传感')) t.add('传感');
      if (p.methods.includes('催化') || p.section.includes('催化')) t.add('催化');
      if (p.nameZh.includes('MOF') || p.nameEn.includes('MOF')) t.add('MOF');
      if (p.nameZh.includes('COF') || p.nameEn.includes('COF')) t.add('COF');
    }
    if (t.size === 0) { t.add('材料性质'); t.add('元数据'); }
    return [...t].slice(0, 10);
  }

  private globFiles(dirPath: string, pattern: string): string[] {
    const results: string[] = [];
    const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    const supported = new Set(['.pdf','.docx','.doc','.md','.txt','.csv','.json','.xml','.yaml','.yml','.png','.jpg','.jpeg','.gif','.webp']);
    function walk(dir: string) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.isFile() && regex.test(e.name) && supported.has(path.extname(e.name).toLowerCase())) results.push(full);
      }
    }
    walk(dirPath);
    return results;
  }
}

export const importService = new ImportService();
