// Import Service — enterprise data pipeline with transactional safety
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/connection.js';
import { entryRepository, CreateEntryInput } from '../repositories/entry.repository.js';
import { chunkRepository } from '../repositories/chunk.repository.js';
import { vectorRepository } from '../repositories/vector.repository.js';
import { parserService, InputFormat, ParseResult } from '../parser/service.js';
import { chunkService, ChunkConfig } from '../chunk/service.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import type { ParsedProperty, Entry } from '../types.js';
import { config } from '../config.js';

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
  parse: { sourceFormat: InputFormat; fileSize: number; wordCount: number; propertyCount: number; warnings: string[] };
  chunks: { count: number; strategy: string };
  embedding: { model: string; vectorCount: number; dimension: number; skipped: boolean };
  vector: { store: string; inserted: number };
  timing: { parseMs: number; chunkMs: number; embedMs: number; totalMs: number };
  errors: string[];
}

export interface BatchImportResult {
  total: number; succeeded: number; failed: number;
  results: ImportResult[]; totalTimeMs: number;
}

export class ImportService {
  async import(input: ImportInput): Promise<ImportResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let parseMs = 0, chunkMs = 0, embedMs = 0;

    // Step 1: Parse (outside transaction — pure I/O)
    const parseStart = Date.now();
    let parseResult: ParseResult;
    try {
      if (input.buffer && input.fileName) {
        parseResult = await parserService.parseBuffer(input.buffer, input.fileName, { extractProperties: true });
      } else if (input.content) {
        parseResult = await parserService.parseString(input.content, input.fileName || 'api_import.md', { extractProperties: true });
      } else if (input.source) {
        parseResult = await parserService.parseFile(input.source, { extractProperties: true });
      } else {
        throw new Error('No input provided');
      }
      parseMs = Date.now() - parseStart;
    } catch (err: any) {
      return this.failureResult(input, [`Parse failed: ${err.message}`], startTime);
    }

    // Steps 2-3: Entry + Chunks (transactional)
    const properties = parseResult.properties || [];
    const title = input.entryMetadata?.title || parseResult.metadata.fileName.replace(/\.[^.]+$/, '') || `Import ${Date.now()}`;

    let entryContent = parseResult.markdown;
    if (properties.length > 0 && !entryContent.includes('|')) {
      entryContent = this.buildPropertyTable(properties);
    }

    let entry: Entry;
    let chunks: ReturnType<typeof chunkService.chunk> = [];

    try {
      const result = await db.transaction(async (tx) => {
        // Create entry
        const e = await entryRepository.create({
          title,
          entry_type: input.entryMetadata?.entry_type || 'data_item',
          summary: input.entryMetadata?.summary || `Imported from ${parseResult.sourceFormat}: ${parseResult.metadata.fileName}`,
          content: entryContent.slice(0, 50000),
          visibility: input.entryMetadata?.visibility || 'internal',
          category_id: input.entryMetadata?.category_id || 5,
          tags: input.entryMetadata?.tags || this.inferTags(parseResult, properties),
        }, tx as any);

        // Chunk
        const chunkStart = Date.now();
        let c: typeof chunks = [];
        try {
          c = chunkService.chunk(entryContent, `entry_${e.id}`, input.chunkConfig || { strategy: 'markdown', chunkSize: 512, overlap: 64 });
          chunkMs = Date.now() - chunkStart;
        } catch (err: any) {
          chunkMs = Date.now() - chunkStart;
          throw err;
        }

        // Save property chunks
        if (properties.length > 0) {
          await chunkRepository.saveFromProperties(e.id, properties, tx as any);
        }

        return { entry: e, chunks: c };
      });

      entry = result.entry;
      chunks = result.chunks;
    } catch (err: any) {
      errors.push(`Entry/Chunk failed: ${err.message}`);
      return this.failureResult(input, errors, startTime);
    }

    // Step 4: Embed + Vector (outside transaction — Ollama is external)
    const embedStart = Date.now();
    let vectorCount = 0, dimension = 0;
    let skipped = input.skipEmbedding || false;

    if (!skipped && chunks.length > 0) {
      try {
        const texts = chunks.map((c) => c.text);
        const vecs = await ollamaEmbedder.embedBatch(texts);
        const validVecs = vecs.filter((v) => v.length > 0);

        if (validVecs.length > 0) {
          dimension = validVecs[0].length;
          const records = chunks.map((c, i) => ({
            chunk_id: c.id,
            entry_id: entry!.id,
            embedding: vecs[i] || [],
          }));
          await vectorRepository.insert(records);
          vectorCount = validVecs.length;
        }
      } catch (err: any) {
        errors.push(`Embedding failed: ${err.message}`);
        skipped = true;
      }
    }
    embedMs = Date.now() - embedStart;

    return {
      success: errors.length === 0 || chunks.length > 0,
      mode: input.mode, source: input.source, entryId: entry!.id,
      parse: { sourceFormat: parseResult.sourceFormat, fileSize: parseResult.metadata.fileSize,
        wordCount: parseResult.metadata.wordCount || 0, propertyCount: properties.length,
        warnings: parseResult.warnings },
      chunks: { count: chunks.length, strategy: input.chunkConfig?.strategy || 'markdown' },
      embedding: { model: config.ollama.embeddingModel, vectorCount, dimension, skipped },
      vector: { store: 'pgvector', inserted: vectorCount },
      timing: { parseMs, chunkMs, embedMs, totalMs: Date.now() - startTime },
      errors,
    };
  }

  async importBatch(dirPath: string, globPattern = '*', options: { skipEmbedding?: boolean; chunkConfig?: Partial<ChunkConfig> } = {}): Promise<BatchImportResult> {
    const startTime = Date.now();
    const results: ImportResult[] = [];
    if (!fs.existsSync(dirPath)) throw new Error(`Directory not found: ${dirPath}`);
    const files = this.globFiles(dirPath, globPattern);
    console.log(`[Import] Batch: ${files.length} files`);

    for (const file of files) {
      try {
        results.push(await this.import({ mode: 'batch', source: file, fileName: path.basename(file), ...options }));
      } catch (err: any) {
        results.push(this.failureResult({ mode: 'batch', source: file }, [err.message], startTime));
      }
    }
    return { total: files.length, succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length, results, totalTimeMs: Date.now() - startTime };
  }

  async importFromApi(content: string, fileName: string, metadata?: ImportInput['entryMetadata'], options?: { skipEmbedding?: boolean; chunkConfig?: Partial<ChunkConfig> }) {
    return this.import({ mode: 'api', source: `api:${fileName}`, content, fileName, entryMetadata: metadata, ...options });
  }

  async importFromUpload(buffer: Buffer, fileName: string, metadata?: ImportInput['entryMetadata'], options?: { skipEmbedding?: boolean; chunkConfig?: Partial<ChunkConfig> }) {
    return this.import({ mode: 'upload', source: `upload:${fileName}`, buffer, fileName, entryMetadata: metadata, ...options });
  }

  getSupportedFormats() {
    return [
      { format: 'pdf' as const, extensions: ['.pdf'], description: 'PDF documents' },
      { format: 'docx' as const, extensions: ['.docx', '.doc'], description: 'Word documents' },
      { format: 'md' as const, extensions: ['.md'], description: 'Markdown' },
      { format: 'txt' as const, extensions: ['.txt', '.csv', '.json', '.xml', '.yaml', '.yml'], description: 'Plain text' },
      { format: 'png' as const, extensions: ['.png'], description: 'PNG images' },
      { format: 'jpg' as const, extensions: ['.jpg', '.jpeg'], description: 'JPEG images' },
      { format: 'gif' as const, extensions: ['.gif'], description: 'GIF images' },
      { format: 'webp' as const, extensions: ['.webp'], description: 'WebP images' },
    ];
  }

  private failureResult(input: ImportInput, errors: string[], startTime: number): ImportResult {
    return {
      success: false, mode: input.mode, source: input.source, entryId: 0,
      parse: { sourceFormat: 'txt', fileSize: 0, wordCount: 0, propertyCount: 0, warnings: [] },
      chunks: { count: 0, strategy: 'none' },
      embedding: { model: config.ollama.embeddingModel, vectorCount: 0, dimension: 0, skipped: true },
      vector: { store: 'pgvector', inserted: 0 },
      timing: { parseMs: 0, chunkMs: 0, embedMs: 0, totalMs: Date.now() - startTime },
      errors,
    };
  }

  private buildPropertyTable(properties: ParsedProperty[]): string {
    let md = `# 材料性质数据元信息\n\n> 自动导入，共 ${properties.length} 个属性定义\n\n`;
    md += `| # | 中文名称 | 英文名称 | 符号 | 定义 | 首选单位 | 其他单位 | 值域 | 方法 | 备注 |\n`;
    md += `|---|---------|---------|------|------|---------|---------|------|------|------|\n`;
    for (const p of properties) {
      md += `| ${p.code} | ${p.nameZh} | ${p.nameEn} | ${p.symbol} | ${p.definition} | ${p.preferredUnit} | ${p.alternativeUnits || '—'} | ${p.valueRange || '—'} | ${p.methods || '—'} | ${p.notes || '—'} |\n`;
    }
    return md;
  }

  private inferTags(parseResult: ParseResult, properties: ParsedProperty[]): string[] {
    const tags = new Set<string>();
    if (parseResult.sourceFormat !== 'md') tags.add(parseResult.sourceFormat.toUpperCase());
    for (const p of properties) {
      if (p.category === 'computational') tags.add('DFT');
      if (p.category === 'experimental') tags.add('实验数据');
      if (p.category === 'cross') tags.add('交叉数据');
      if (p.category === 'condition') tags.add('条件参数');
      if (p.methods.includes('吸附')) tags.add('吸附分离');
      if (p.methods.includes('传感') || p.section.includes('传感')) tags.add('传感');
      if (p.methods.includes('催化') || p.section.includes('催化')) tags.add('催化');
      if (p.nameZh.includes('MOF') || p.nameEn.includes('MOF')) tags.add('MOF');
      if (p.nameZh.includes('COF') || p.nameEn.includes('COF')) tags.add('COF');
    }
    if (tags.size === 0) { tags.add('材料性质'); tags.add('元数据'); }
    return [...tags].slice(0, 10);
  }

  private globFiles(dirPath: string, pattern: string): string[] {
    const results: string[] = [];
    const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    const supported = new Set(['.pdf','.docx','.doc','.md','.txt','.csv','.json','.xml','.yaml','.yml','.png','.jpg','.jpeg','.gif','.webp']);
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && regex.test(entry.name) && supported.has(path.extname(entry.name).toLowerCase())) results.push(full);
      }
    }
    walk(dirPath);
    return results;
  }
}

export const importService = new ImportService();
