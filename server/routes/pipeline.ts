// Pipeline API Routes — enterprise data pipeline
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { getParser, ParserError } from '../../backend/parser/index.js';
import { chunkService } from '../../backend/chunk/service.js';
import { importService } from '../../backend/services/import.service.js';
import { searchService } from '../../backend/services/search.service.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { vectorRepository } from '../../backend/repositories/vector.repository.js';
import { ollamaEmbedder } from '../../backend/embedding/ollama.js';
import { config } from '../../backend/config.js';

export const pipelineRouter = Router();

// Multer setup
let upload: any = null;
try {
  const tmpDir = './backend/data/uploads';
  fs.mkdirSync(tmpDir, { recursive: true });
  upload = multer({ dest: tmpDir, limits: { fileSize: 50 * 1024 * 1024 } });
} catch { console.warn('[Pipeline] multer not available'); }

// Health
pipelineRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    pipeline: {
      ollama: config.ollama.url,
      chatModel: config.ollama.chatModel,
      embeddingModel: config.ollama.embeddingModel,
      vectorStore: 'pgvector',
      database: 'connected',
    },
    supportedFormats: importService.getSupportedFormats(),
    timestamp: new Date().toISOString(),
  });
});

// Formats
pipelineRouter.get('/formats', (_req: Request, res: Response) => {
  res.json({ formats: importService.getSupportedFormats() });
});

// Parse
pipelineRouter.post('/parse', async (req: Request, res: Response) => {
  try {
    const { content, fileName, filePath } = req.body || {};
    const parser = getParser();

    if (!content && !fileName && !filePath) {
      res.status(400).json({
        error: 'MISSING_INPUT',
        message: 'Provide "content" (string), "fileName" (path), or "filePath" (path)',
        supportedFormats: parser.getCapabilities().filter((c) => c.available),
      });
      return;
    }

    const result = content
      ? await parser.parseString(content, fileName || 'input.md', { extractProperties: true })
      : await parser.parseFile(fileName || filePath, { extractProperties: true });

    res.json({
      success: true,
      format: result.sourceFormat,
      markdown: result.markdown.slice(0, 10000),
      fullLength: result.markdown.length,
      metadata: result.metadata,
      propertyCount: result.properties?.length || 0,
      properties: (result.properties || []).slice(0, 20),
      warnings: result.warnings,
      timing: result.timing,
    });
  } catch (err: any) {
    if (err instanceof ParserError) {
      res.status(422).json({
        error: 'PARSE_FAILED',
        code: err.code,
        message: err.message,
        suggestion: err.suggestion,
        fileName: err.fileName,
        format: err.format,
      });
    } else {
      res.status(500).json({ error: 'PARSE_FAILED', message: err.message });
    }
  }
});

// Chunk
pipelineRouter.post('/chunk', async (req: Request, res: Response) => {
  try {
    const { text, strategy, chunkSize, overlap } = req.body || {};
    if (!text) { res.status(400).json({ error: 'MISSING_INPUT' }); return; }
    const chunks = chunkService.chunk(text, 'api_input', { strategy: strategy || 'markdown', chunkSize: chunkSize || 1024, overlap: overlap || 128 });
    res.json({ success: true, chunkCount: chunks.length, config: { strategy: strategy || 'markdown', chunkSize: chunkSize || 1024, overlap: overlap || 128 }, chunks: chunks.slice(0, 50).map((c) => ({ id: c.id, index: c.index, text: c.text.slice(0, 500), fullLength: c.text.length, heading: c.metadata.heading })) });
  } catch (err: any) { res.status(500).json({ error: 'CHUNK_FAILED', message: err.message }); }
});

// Embed
pipelineRouter.post('/embed', async (req: Request, res: Response) => {
  try {
    const { text, texts, entryId } = req.body || {};
    const inputTexts: string[] = texts || (text ? [text] : []);
    if (inputTexts.length === 0) { res.status(400).json({ error: 'MISSING_INPUT' }); return; }
    let chunks = inputTexts;
    if (inputTexts.length === 1 && inputTexts[0].length > 1024) chunks = chunkService.chunk(inputTexts[0], 'embed_input').map((c) => c.text);
    const { vectors, failed } = await ollamaEmbedder.embedBatch(chunks);
    const valid = vectors.filter((v) => v.length > 0);
    if (valid.length > 0 && entryId) {
      await vectorRepository.insert(valid.map((v) => ({ chunk_id: '', entry_id: entryId, embedding: v })));
    }
    res.json({ success: true, inputCount: inputTexts.length, chunkCount: chunks.length, vectorCount: valid.length, failedCount: failed.length, dimension: valid[0]?.length || 0, model: config.ollama.embeddingModel });
  } catch (err: any) { res.status(503).json({ error: 'EMBED_FAILED', message: err.message }); }
});

// Import (file upload + JSON body)
pipelineRouter.post('/import', async (req: Request, res: Response) => {
  try {
    if (upload && req.headers['content-type']?.includes('multipart/form-data')) {
      upload.single('file')(req, res, async (err: any) => {
        if (err) {
          console.error('[Upload] Multer error:', err.message);
          res.status(400).json({ error: 'UPLOAD_FAILED', message: err.message, code: err.code || 'MULTER_ERROR' });
          return;
        }
        const file = (req as any).file;
        if (!file) {
          console.error('[Upload] No file in request');
          res.status(400).json({ error: 'NO_FILE', message: 'No file uploaded. Use field name "file".' });
          return;
        }

        console.log(`[Upload] Received: name=${file.originalname} size=${file.size} type=${file.mimetype} tmp=${file.path}`);

        // Validate: reject empty uploads before any processing
        if (!file.size || file.size === 0) {
          console.error(`[Upload] Empty file: ${file.originalname}`);
          try { fs.unlinkSync(file.path); } catch { /* ignore */ }
          res.status(422).json({
            success: false,
            error: 'EMPTY_UPLOAD',
            message: `Uploaded file "${file.originalname}" is empty (0 bytes).`,
            suggestion: 'Check that the file has content before uploading.',
            stages: [{ stage: 'parse', status: 'failed', ms: 0, detail: 'Empty file: 0 bytes' }],
            errors: ['Empty file: 0 bytes'],
          });
          return;
        }

        // Read buffer with size validation
        const buffer = fs.readFileSync(file.path);
        console.log(`[Upload] Buffer: ${buffer.length} bytes (file: ${file.originalname})`);

        if (!buffer || buffer.length === 0) {
          console.error(`[Upload] Buffer empty after read: ${file.originalname}`);
          try { fs.unlinkSync(file.path); } catch { /* ignore */ }
          res.status(422).json({
            success: false,
            error: 'EMPTY_BUFFER',
            message: `File "${file.originalname}" was received but buffer is empty.`,
            stages: [{ stage: 'parse', status: 'failed', ms: 0, detail: 'Empty buffer after disk read' }],
            errors: ['Empty buffer after disk read'],
          });
          return;
        }

        const result = await importService.importFromUpload(buffer, file.originalname,
          req.body.metadata ? JSON.parse(req.body.metadata) : undefined,
          { skipEmbedding: req.body.skipEmbedding === 'true', chunkConfig: req.body.chunkConfig ? JSON.parse(req.body.chunkConfig) : undefined });
        try { fs.unlinkSync(file.path); } catch { /* ignore */ }
        res.status(result.success ? 200 : 422).json(result);
      });
      return;
    }
    const { filePath, content, fileName, metadata, skipEmbedding, chunkConfig } = req.body || {};
    if (!filePath && !content) {
      res.status(400).json({ error: 'MISSING_INPUT', message: 'Provide filePath, content, or file upload' });
      return;
    }
    if (content && !content.trim()) {
      res.status(422).json({
        success: false,
        error: 'EMPTY_CONTENT',
        message: 'Content string is empty.',
        stages: [{ stage: 'parse', status: 'failed', ms: 0, detail: 'Empty content string' }],
        errors: ['Empty content string'],
      });
      return;
    }
    const result = content
      ? await importService.importFromApi(content, fileName || 'api_import.md', metadata, { skipEmbedding, chunkConfig })
      : await importService.importFromUpload(fs.readFileSync(filePath), path.basename(filePath), metadata, { skipEmbedding, chunkConfig });
    res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    console.error('[Pipeline] Import failed:', err.message, err.code, err.detail, err.constraint);
    res.status(500).json({
      error: 'IMPORT_FAILED',
      message: err.message,
      code: err.code || undefined,
      detail: err.detail || undefined,
      constraint: err.constraint || undefined,
    });
  }
});

// Import string
pipelineRouter.post('/import/string', async (req: Request, res: Response) => {
  try {
      const { content, fileName, metadata, skipEmbedding, chunkConfig } = req.body || {};
      // 兼容前端传的 entryMetadata（与 metadata 同义）
      const meta = metadata || (req.body as any)?.entryMetadata;
      if (!content) { res.status(400).json({ error: 'MISSING_INPUT' }); return; }
      const result = await importService.importFromApi(content, fileName || 'api_import.md', meta, { skipEmbedding, chunkConfig });
    res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    console.error('[Pipeline] String import failed:', err.message, err.code, err.detail, err.constraint);
    res.status(500).json({
      error: 'IMPORT_FAILED', message: err.message,
      code: err.code || undefined, detail: err.detail || undefined, constraint: err.constraint || undefined,
    });
  }
});

// Batch import
pipelineRouter.post('/import/batch', async (req: Request, res: Response) => {
  try {
    const { dirPath, pattern, skipEmbedding, chunkConfig } = req.body || {};
    if (!dirPath) { res.status(400).json({ error: 'MISSING_INPUT' }); return; }
    res.json(await importService.importBatch(dirPath, pattern || '*', { skipEmbedding, chunkConfig }));
  } catch (err: any) { res.status(500).json({ error: 'BATCH_IMPORT_FAILED', message: err.message }); }
});

// Semantic search
pipelineRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, topK, isInternal } = req.body || {};
    if (!query?.trim()) { res.json({ results: [], source: 'pgvector', queryTimeMs: 0 }); return; }
    const start = Date.now();
    const results = await searchService.semanticSearch(query.trim(), isInternal || false, topK || 10);
    res.json({ query: query.trim(), totalResults: results.length, queryTimeMs: Date.now() - start, source: 'pgvector',
      results: results.map((r) => ({ entryId: r.entry.id, title: r.entry.title, entryType: r.entry.entry_type, summary: r.entry.summary, score: Math.round(r.score * 1000) / 1000, tags: r.entry.tags.slice(0, 5), visibility: r.entry.visibility })) });
  } catch (err: any) { res.status(503).json({ error: 'SEARCH_FAILED', message: err.message }); }
});

// Status
pipelineRouter.get('/status', async (_req: Request, res: Response) => {
  const count = await entryRepository.count(true);
  res.json({ pipeline: { ollama: { url: config.ollama.url, chatModel: config.ollama.chatModel, embeddingModel: config.ollama.embeddingModel }, vectorStore: { pgvector: 'connected' }, data: { totalEntries: count, dataDir: config.dataDir }, embeddingDimension: 1024 }, timestamp: new Date().toISOString() });
});
