// Data Import Service — orchestrates the full enterprise data pipeline:
//   Upload → Parse → Document → Chunk → Embed → Vector
//
// Supports three import modes:
//   1. File upload (multipart form-data)
//   2. API (raw content + metadata)
//   3. Batch import (directory scanning, glob patterns)

import fs from 'node:fs';
import path from 'node:path';
import { parserService, InputFormat, ParseResult } from '../parser/service.js';
import { chunkService, ChunkConfig } from '../chunk/service.js';
import { documentStore } from '../document/store.js';
import { metadataStore } from '../metadata/store.js';
import { ollamaEmbedder } from '../embedding/ollama.js';
import { milvusClient } from '../vector/milvus.js';
import { memoryVectorStore } from '../vector/memory.js';
import { markdownParser } from '../parser/markdown.js';
import type { ParsedProperty, Entry } from '../types.js';
import { config } from '../config.js';

// ---- Types ----

export type ImportMode = 'upload' | 'api' | 'batch';

export interface ImportInput {
  mode: ImportMode;
  /** File path (upload/batch) or source name (api) */
  source: string;
  /** Raw content (api mode) */
  content?: string;
  /** Binary buffer (upload mode) */
  buffer?: Buffer;
  /** Original filename */
  fileName?: string;
  /** Entry metadata for API mode */
  entryMetadata?: {
    title?: string;
    entry_type?: Entry['entry_type'];
    summary?: string;
    visibility?: Entry['visibility'];
    category_id?: number;
    tags?: string[];
  };
  /** Chunking configuration */
  chunkConfig?: Partial<ChunkConfig>;
  /** Skip embedding step (dry run) */
  skipEmbedding?: boolean;
}

export interface ImportResult {
  success: boolean;
  mode: ImportMode;
  source: string;
  /** Created/updated entry ID */
  entryId: number;
  /** Parse result */
  parse: {
    sourceFormat: InputFormat;
    fileSize: number;
    wordCount: number;
    propertyCount: number;
    warnings: string[];
  };
  /** Chunk result */
  chunks: {
    count: number;
    strategy: string;
  };
  /** Embedding result */
  embedding: {
    model: string;
    vectorCount: number;
    dimension: number;
    skipped: boolean;
  };
  /** Vector store result */
  vector: {
    store: 'milvus' | 'memory' | 'none';
    inserted: number;
  };
  /** Timing */
  timing: {
    parseMs: number;
    chunkMs: number;
    embedMs: number;
    totalMs: number;
  };
  errors: string[];
}

export interface BatchImportResult {
  total: number;
  succeeded: number;
  failed: number;
  results: ImportResult[];
  totalTimeMs: number;
}

// ---- Pipeline steps (reusable) ----

class DataImportService {
  /**
   * Full pipeline: Parse → Metadata → Chunk → Embed → Vector
   */
  async import(input: ImportInput): Promise<ImportResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let parseMs = 0, chunkMs = 0, embedMs = 0;

    // ---- Step 1: Parse ----
    const parseStart = Date.now();
    let parseResult: ParseResult;

    try {
      if (input.buffer && input.fileName) {
        parseResult = await parserService.parseBuffer(input.buffer, input.fileName, {
          extractProperties: true,
        });
      } else if (input.content) {
        parseResult = await parserService.parseString(
          input.content,
          input.fileName || 'api_import.md',
          { extractProperties: true }
        );
      } else if (input.source) {
        parseResult = await parserService.parseFile(input.source, {
          extractProperties: true,
        });
      } else {
        throw new Error('No input provided — need buffer, content, or source path');
      }
      parseMs = Date.now() - parseStart;
    } catch (err: any) {
      errors.push(`Parse failed: ${err.message}`);
      return this.failureResult(input, errors, startTime);
    }

    // ---- Step 2: Create/Update Metadata Entry ----
    const title = input.entryMetadata?.title ||
      parseResult.metadata.fileName.replace(/\.[^.]+$/, '') ||
      `Import ${Date.now()}`;

    const properties = parseResult.properties || [];

    // Build entry content: if we have structured properties, format them as a table
    let entryContent = parseResult.markdown;
    if (properties.length > 0 && !entryContent.includes('|')) {
      // Content was parsed from a structured table — rebuild as markdown
      entryContent = this.buildPropertyTable(properties);
    }

    const entry = metadataStore.createEntry({
      title,
      entry_type: input.entryMetadata?.entry_type || 'data_item',
      summary: input.entryMetadata?.summary ||
        `Imported from ${parseResult.sourceFormat}: ${parseResult.metadata.fileName} (${properties.length} properties)`,
      content: entryContent.slice(0, 50000), // Truncate huge content
      visibility: input.entryMetadata?.visibility || 'internal',
      category_id: input.entryMetadata?.category_id || 5,
      tags: input.entryMetadata?.tags || this.inferTags(parseResult, properties),
    });

    // ---- Step 3: Chunk ----
    const chunkStart = Date.now();
    let chunks: ReturnType<typeof chunkService.chunk> = [];

    try {
      chunks = chunkService.chunk(
        entryContent,
        `entry_${entry.id}`,
        input.chunkConfig || { strategy: 'markdown', chunkSize: 512, overlap: 64 }
      );
      chunkMs = Date.now() - chunkStart;
    } catch (err: any) {
      errors.push(`Chunk failed: ${err.message}`);
      chunkMs = Date.now() - chunkStart;
    }

    // Also save structured property chunks if available
    if (properties.length > 0) {
      documentStore.save(entry.id, properties);
    }

    // ---- Step 4: Embed ----
    const embedStart = Date.now();
    let vectorCount = 0;
    let dimension = 0;
    let skipped = input.skipEmbedding || false;

    if (!skipped && chunks.length > 0) {
      try {
        const texts = chunks.map((c) => c.text);
        const vectors = await ollamaEmbedder.embedBatch(texts);
        const validVectors = vectors.filter((v) => v.length > 0);

        if (validVectors.length > 0) {
          dimension = validVectors[0].length;

          // ---- Step 5: Vector Store ----
          const records = chunks.map((c, i) => ({
            chunk_id: c.id,  // e.g. "entry_9_chunk_3"
            entry_id: entry.id,
            embedding: vectors[i] || [],
          }));

          const store = milvusClient.isReady() ? milvusClient : memoryVectorStore;
          await store.insert(records);
          vectorCount = validVectors.length;
        }
      } catch (err: any) {
        errors.push(`Embedding failed: ${err.message}`);
        skipped = true;
      }
    }
    embedMs = Date.now() - embedStart;

    const totalMs = Date.now() - startTime;

    return {
      success: errors.length === 0 || chunks.length > 0, // partial success if we at least chunked
      mode: input.mode,
      source: input.source,
      entryId: entry.id,
      parse: {
        sourceFormat: parseResult.sourceFormat,
        fileSize: parseResult.metadata.fileSize,
        wordCount: parseResult.metadata.wordCount || 0,
        propertyCount: properties.length,
        warnings: parseResult.warnings,
      },
      chunks: {
        count: chunks.length,
        strategy: input.chunkConfig?.strategy || 'markdown',
      },
      embedding: {
        model: config.ollama.embeddingModel,
        vectorCount,
        dimension,
        skipped,
      },
      vector: {
        store: milvusClient.isReady() ? 'milvus' : (memoryVectorStore.isReady() ? 'memory' : 'none'),
        inserted: vectorCount,
      },
      timing: { parseMs, chunkMs, embedMs, totalMs },
      errors,
    };
  }

  /**
   * Batch import — scan a directory and import all supported files.
   */
  async importBatch(
    dirPath: string,
    globPattern: string = '*',
    options: {
      skipEmbedding?: boolean;
      chunkConfig?: Partial<ChunkConfig>;
    } = {}
  ): Promise<BatchImportResult> {
    const startTime = Date.now();
    const results: ImportResult[] = [];
    let succeeded = 0;
    let failed = 0;

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    // Simple glob: find all files matching pattern
    const files = this.globFiles(dirPath, globPattern);

    console.log(`[ImportService] Batch import: ${files.length} files found`);

    for (const file of files) {
      try {
        const result = await this.import({
          mode: 'batch',
          source: file,
          fileName: path.basename(file),
          skipEmbedding: options.skipEmbedding,
          chunkConfig: options.chunkConfig,
        });
        results.push(result);
        if (result.success) succeeded++;
        else failed++;
      } catch (err: any) {
        failed++;
        results.push(this.failureResult(
          { mode: 'batch', source: file },
          [`${err.message}`],
          startTime
        ));
      }
    }

    return {
      total: files.length,
      succeeded,
      failed,
      results,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Import from API — content string with metadata.
   */
  async importFromApi(
    content: string,
    fileName: string,
    metadata?: ImportInput['entryMetadata'],
    options: { skipEmbedding?: boolean; chunkConfig?: Partial<ChunkConfig> } = {}
  ): Promise<ImportResult> {
    return this.import({
      mode: 'api',
      source: `api:${fileName}`,
      content,
      fileName,
      entryMetadata: metadata,
      skipEmbedding: options.skipEmbedding,
      chunkConfig: options.chunkConfig,
    });
  }

  /**
   * Import from file upload — buffer with filename.
   */
  async importFromUpload(
    buffer: Buffer,
    fileName: string,
    metadata?: ImportInput['entryMetadata'],
    options: { skipEmbedding?: boolean; chunkConfig?: Partial<ChunkConfig> } = {}
  ): Promise<ImportResult> {
    return this.import({
      mode: 'upload',
      source: `upload:${fileName}`,
      buffer,
      fileName,
      entryMetadata: metadata,
      skipEmbedding: options.skipEmbedding,
      chunkConfig: options.chunkConfig,
    });
  }

  /**
   * Get supported input formats.
   */
  getSupportedFormats(): { format: InputFormat; extensions: string[]; description: string }[] {
    return [
      { format: 'pdf', extensions: ['.pdf'], description: 'PDF documents (requires: npm install pdf-parse)' },
      { format: 'docx', extensions: ['.docx', '.doc'], description: 'Word documents (requires: npm install mammoth)' },
      { format: 'md', extensions: ['.md'], description: 'Markdown documents (native support)' },
      { format: 'txt', extensions: ['.txt', '.csv', '.json', '.xml', '.yaml', '.yml'], description: 'Plain text files' },
      { format: 'png', extensions: ['.png'], description: 'PNG images (metadata only; OCR needs vision model)' },
      { format: 'jpg', extensions: ['.jpg', '.jpeg'], description: 'JPEG images (metadata only)' },
      { format: 'gif', extensions: ['.gif'], description: 'GIF images (metadata only)' },
      { format: 'webp', extensions: ['.webp'], description: 'WebP images (metadata only)' },
    ];
  }

  // ---- Private helpers ----

  private failureResult(input: ImportInput, errors: string[], startTime: number): ImportResult {
    return {
      success: false,
      mode: input.mode,
      source: input.source,
      entryId: 0,
      parse: { sourceFormat: 'txt', fileSize: 0, wordCount: 0, propertyCount: 0, warnings: [] },
      chunks: { count: 0, strategy: 'none' },
      embedding: { model: config.ollama.embeddingModel, vectorCount: 0, dimension: 0, skipped: true },
      vector: { store: 'none', inserted: 0 },
      timing: { parseMs: 0, chunkMs: 0, embedMs: 0, totalMs: Date.now() - startTime },
      errors,
    };
  }

  private buildPropertyTable(properties: ParsedProperty[]): string {
    let md = `# 材料性质数据元信息\n\n`;
    md += `> 自动导入，共 ${properties.length} 个属性定义\n\n`;
    md += `| # | 中文名称 | 英文名称 | 符号 | 定义 | 首选单位 | 其他单位 | 值域 | 方法 | 备注 |\n`;
    md += `|---|---------|---------|------|------|---------|---------|------|------|------|\n`;
    for (const p of properties) {
      md += `| ${p.code} | ${p.nameZh} | ${p.nameEn} | ${p.symbol} | ${p.definition} | ${p.preferredUnit} | ${p.alternativeUnits || '—'} | ${p.valueRange || '—'} | ${p.methods || '—'} | ${p.notes || '—'} |\n`;
    }
    return md;
  }

  private inferTags(parseResult: ParseResult, properties: ParsedProperty[]): string[] {
    const tags = new Set<string>();

    // Source format tag
    if (parseResult.sourceFormat !== 'md') {
      tags.add(parseResult.sourceFormat.toUpperCase());
    }

    // Property category tags
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

    if (tags.size === 0) {
      tags.add('材料性质');
      tags.add('元数据');
    }

    return [...tags].slice(0, 10);
  }

  private globFiles(dirPath: string, pattern: string): string[] {
    const results: string[] = [];

    // Convert simple glob to regex
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexStr}$`, 'i');

    // Supported extensions
    const supported = new Set([
      '.pdf', '.docx', '.doc', '.md', '.txt',
      '.csv', '.json', '.xml', '.yaml', '.yml',
      '.png', '.jpg', '.jpeg', '.gif', '.webp',
    ]);

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && regex.test(entry.name) && supported.has(path.extname(entry.name).toLowerCase())) {
          results.push(fullPath);
        }
      }
    }

    walk(dirPath);
    return results;
  }
}

export const dataImportService = new DataImportService();
