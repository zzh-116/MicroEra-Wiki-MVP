// Pipeline API Routes — Enterprise Data Pipeline endpoints
//   Upload → Parse → Document → Chunk → Embed → Vector → Retrieve → LLM → Response
//
// Endpoints:
//   POST /api/pipeline/import          — Full pipeline from file upload (multipart)
//   POST /api/pipeline/import/string   — Full pipeline from raw content string
//   POST /api/pipeline/parse           — Parse only (file or string → markdown)
//   POST /api/pipeline/chunk           — Chunk only (markdown → chunks)
//   POST /api/pipeline/embed           — Embed + vector store (chunks → vectors)
//   POST /api/pipeline/search          — Semantic search endpoint
//   GET  /api/pipeline/formats         — List supported input formats
//   GET  /api/pipeline/health          — Pipeline health check

import { Router, Request, Response } from 'express';
import multer from 'multer'; // optional — graceful if missing
import path from 'node:path';
import fs from 'node:fs';

import { parserService } from '../../backend/parser/service.js';
import { chunkService } from '../../backend/chunk/service.js';
import { dataImportService } from '../../backend/import/service.js';
import { semanticSearch } from '../../backend/retrieval/search.js';
import { ollamaEmbedder } from '../../backend/embedding/ollama.js';
import { milvusClient } from '../../backend/vector/milvus.js';
import { memoryVectorStore } from '../../backend/vector/memory.js';
import { metadataStore } from '../../backend/metadata/store.js';
import { config } from '../../backend/config.js';

export const pipelineRouter = Router();

// ---- Multer setup (optional) ----
let upload: any = null;
try {
  const tmpDir = './backend/data/uploads';
  fs.mkdirSync(tmpDir, { recursive: true });
  upload = multer({
    dest: tmpDir,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });
} catch {
  console.warn('[Pipeline] multer not available — file upload endpoints disabled. Install: npm install multer');
}

// ---- Health ----

pipelineRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    pipeline: {
      ollama: config.ollama.url,
      chatModel: config.ollama.chatModel,
      embeddingModel: config.ollama.embeddingModel,
      milvus: milvusClient.isReady() ? 'connected' : 'offline',
      memoryVector: memoryVectorStore.isReady() ? 'ready' : 'offline',
    },
    supportedFormats: dataImportService.getSupportedFormats(),
    timestamp: new Date().toISOString(),
  });
});

// ---- Supported Formats ----

pipelineRouter.get('/formats', (_req: Request, res: Response) => {
  res.json({ formats: dataImportService.getSupportedFormats() });
});

// ---- Parse Only ----

pipelineRouter.post('/parse', async (req: Request, res: Response) => {
  try {
    const { content, fileName } = req.body || {};

    if (!content && !fileName) {
      res.status(400).json({ error: 'MISSING_INPUT', message: 'Provide content or filePath' });
      return;
    }

    let result;
    if (content) {
      result = await parserService.parseString(content, fileName || 'input.md', { extractProperties: true });
    } else {
      result = await parserService.parseFile(fileName, { extractProperties: true });
    }

    res.json({
      success: true,
      markdown: result.markdown.slice(0, 10000), // Truncate for API response
      fullLength: result.markdown.length,
      metadata: result.metadata,
      propertyCount: result.properties?.length || 0,
      properties: (result.properties || []).slice(0, 20), // First 20 properties
      warnings: result.warnings,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'PARSE_FAILED', message: err.message });
  }
});

// ---- Chunk Only ----

pipelineRouter.post('/chunk', async (req: Request, res: Response) => {
  try {
    const { text, strategy, chunkSize, overlap } = req.body || {};

    if (!text) {
      res.status(400).json({ error: 'MISSING_INPUT', message: 'Provide text to chunk' });
      return;
    }

    const chunks = chunkService.chunk(text, 'api_input', {
      strategy: strategy || 'markdown',
      chunkSize: chunkSize || 1024,
      overlap: overlap || 128,
    });

    res.json({
      success: true,
      chunkCount: chunks.length,
      config: { strategy: strategy || 'markdown', chunkSize: chunkSize || 1024, overlap: overlap || 128 },
      chunks: chunks.slice(0, 50).map((c) => ({
        id: c.id,
        index: c.index,
        text: c.text.slice(0, 500),
        fullLength: c.text.length,
        heading: c.metadata.heading,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'CHUNK_FAILED', message: err.message });
  }
});

// ---- Embed Only (text → vectors → store) ----

pipelineRouter.post('/embed', async (req: Request, res: Response) => {
  try {
    const { text, texts, entryId } = req.body || {};
    const inputTexts: string[] = texts || (text ? [text] : []);

    if (inputTexts.length === 0) {
      res.status(400).json({ error: 'MISSING_INPUT', message: 'Provide text or texts array' });
      return;
    }

    // Chunk if needed
    let chunks = inputTexts;
    if (inputTexts.length === 1 && inputTexts[0].length > 1024) {
      chunks = chunkService.chunk(inputTexts[0], 'embed_input').map((c) => c.text);
    }

    // Generate embeddings
    const vectors = await ollamaEmbedder.embedBatch(chunks);
    const validVectors = vectors.filter((v) => v.length > 0);

    // Insert into vector store
    let stored = 0;
    if (validVectors.length > 0 && entryId) {
      const store = milvusClient.isReady() ? milvusClient : memoryVectorStore;
      await store.insert(
        validVectors.map((v) => ({ entry_id: entryId, embedding: v }))
      );
      stored = validVectors.length;
    }

    res.json({
      success: true,
      inputCount: inputTexts.length,
      chunkCount: chunks.length,
      vectorCount: validVectors.length,
      dimension: validVectors[0]?.length || 0,
      storedInVectorDb: stored,
      model: config.ollama.embeddingModel,
      sampleVector: validVectors[0]?.slice(0, 10) || [],
    });
  } catch (err: any) {
    res.status(503).json({ error: 'EMBED_FAILED', message: err.message });
  }
});

// ---- Full Pipeline Import (file upload) ----

pipelineRouter.post('/import', async (req: Request, res: Response) => {
  try {
    // Check for multipart upload
    if (upload && req.headers['content-type']?.includes('multipart/form-data')) {
      upload.single('file')(req, res, async (err: any) => {
        if (err) {
          res.status(400).json({ error: 'UPLOAD_FAILED', message: err.message });
          return;
        }

        const file = (req as any).file;
        if (!file) {
          res.status(400).json({ error: 'NO_FILE', message: 'No file uploaded' });
          return;
        }

        const buffer = fs.readFileSync(file.path);
        const result = await dataImportService.importFromUpload(
          buffer,
          file.originalname,
          req.body.metadata ? JSON.parse(req.body.metadata) : undefined,
          {
            skipEmbedding: req.body.skipEmbedding === 'true',
            chunkConfig: req.body.chunkConfig ? JSON.parse(req.body.chunkConfig) : undefined,
          }
        );

        // Cleanup temp file
        try { fs.unlinkSync(file.path); } catch { /* ignore */ }

        res.status(result.success ? 200 : 422).json(result);
        if (!result.success) {
          console.error('[Pipeline] Import failed:', JSON.stringify(result.errors));
        }
      });
      return;
    }

    // JSON body mode: filePath or content
    const { filePath, content, fileName, metadata, skipEmbedding, chunkConfig } = req.body || {};

    if (!filePath && !content) {
      res.status(400).json({
        error: 'MISSING_INPUT',
        message: 'Provide filePath, content, or multipart file upload',
        hint: 'Use multipart/form-data with field name "file" for file uploads',
      });
      return;
    }

    let result;
    if (content) {
      result = await dataImportService.importFromApi(content, fileName || 'api_import.md', metadata, {
        skipEmbedding,
        chunkConfig,
      });
    } else {
      // filePath mode
      const buffer = fs.readFileSync(filePath);
      result = await dataImportService.importFromUpload(
        buffer,
        path.basename(filePath),
        metadata,
        { skipEmbedding, chunkConfig }
      );
    }

    res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'IMPORT_FAILED', message: err.message });
  }
});

// ---- Full Pipeline Import (string content) ----

pipelineRouter.post('/import/string', async (req: Request, res: Response) => {
  try {
    const { content, fileName, metadata, skipEmbedding, chunkConfig } = req.body || {};

    if (!content) {
      res.status(400).json({ error: 'MISSING_INPUT', message: 'Provide content string' });
      return;
    }

    const result = await dataImportService.importFromApi(
      content,
      fileName || 'api_import.md',
      metadata,
      { skipEmbedding, chunkConfig }
    );

    res.status(result.success ? 200 : 422).json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'IMPORT_FAILED', message: err.message });
  }
});

// ---- Batch Import ----

pipelineRouter.post('/import/batch', async (req: Request, res: Response) => {
  try {
    const { dirPath, pattern, skipEmbedding, chunkConfig } = req.body || {};

    if (!dirPath) {
      res.status(400).json({ error: 'MISSING_INPUT', message: 'Provide dirPath to scan' });
      return;
    }

    const result = await dataImportService.importBatch(dirPath, pattern || '*', {
      skipEmbedding,
      chunkConfig,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'BATCH_IMPORT_FAILED', message: err.message });
  }
});

// ---- Semantic Search ----

pipelineRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, topK, isInternal } = req.body || {};

    if (!query?.trim()) {
      res.json({ results: [], source: 'semantic', queryTimeMs: 0 });
      return;
    }

    const startTime = Date.now();
    const results = await semanticSearch.search(query.trim(), isInternal || false, topK || 10);
    const queryTimeMs = Date.now() - startTime;

    res.json({
      query: query.trim(),
      totalResults: results.length,
      queryTimeMs,
      source: milvusClient.isReady() ? 'milvus' : (memoryVectorStore.isReady() ? 'memory_vector' : 'keyword'),
      results: results.map((r) => ({
        entryId: r.entry.id,
        title: r.entry.title,
        entryType: r.entry.entry_type,
        summary: r.entry.summary,
        score: Math.round(r.score * 1000) / 1000,
        tags: r.entry.tags.slice(0, 5),
        visibility: r.entry.visibility,
      })),
    });
  } catch (err: any) {
    res.status(503).json({ error: 'SEARCH_FAILED', message: err.message });
  }
});

// ---- Pipeline Status (summary) ----

pipelineRouter.get('/status', (_req: Request, res: Response) => {
  const entryCount = metadataStore.getEntries({}, true).length;
  const vectorCount = memoryVectorStore.isReady() ? '[memory store active]' : 'N/A';

  res.json({
    pipeline: {
      ollama: {
        url: config.ollama.url,
        chatModel: config.ollama.chatModel,
        embeddingModel: config.ollama.embeddingModel,
      },
      vectorStore: {
        milvus: milvusClient.isReady() ? 'connected' : 'offline',
        memory: memoryVectorStore.isReady() ? 'ready' : 'offline',
      },
      data: {
        totalEntries: entryCount,
        vectorCount,
        dataDir: config.dataDir,
      },
      embeddingDimension: config.milvus.dimension,
    },
    timestamp: new Date().toISOString(),
  });
});
