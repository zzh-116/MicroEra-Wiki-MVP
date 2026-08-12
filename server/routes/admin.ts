// Admin Routes — 管理运维操作（重建索引、批量操作等）
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { chunkRepository } from '../../backend/repositories/chunk.repository.js';
import { vectorRepository } from '../../backend/repositories/vector.repository.js';
import { chunkService } from '../../backend/chunk/service.js';
import { ollamaEmbedder } from '../../backend/embedding/ollama.js';
import { config } from '../../backend/config.js';
import { createLogger } from '../../backend/utils/logger.js';
import { rebuildSemanticRelations } from '../../backend/services/graph-rebuild.service.js';

const logger = createLogger('Admin');

export const adminRouter = Router();

// All admin routes require authentication
adminRouter.use(requireAuth);

/**
 * POST /api/admin/graph-rebuild
 *
 * Dev/ops endpoint: batch-generate semantic_related edges via pgvector
 * similarity and persist them into entry_relations. Graph APIs then read
 * from that table instead of recomputing relations on every request.
 */
adminRouter.post('/graph-rebuild', async (_req: Request, res: Response) => {
  try {
    const result = await rebuildSemanticRelations();
    res.json(result);
  } catch (err: any) {
    console.error('[Admin] Graph rebuild failed:', err.message);
    res.status(500).json({
      success: false,
      error: 'GRAPH_REBUILD_FAILED',
      message: err.message,
    });
  }
});

/**
 * POST /api/admin/rebuild-embeddings
 *
 * 一键重建所有条目的向量嵌入。
 * 使用场景：
 *   - 更换了 Embedding 模型（如 bge-m3 → nomic-embed-text）
 *   - 修改了分块策略（chunkSize / overlap）
 *   - 向量数据损坏或丢失
 *
 * 流程：
 *   1. 清空所有现有向量
 *   2. 逐条读取所有条目
 *   3. 重新分块（markdown strategy, 1024/128）
 *   4. 重新嵌入（当前配置的 Embedding 模型）
 *   5. 写入向量库（pgvector）
 */
adminRouter.post('/rebuild-embeddings', async (req: Request, res: Response) => {
  const t0 = Date.now();

  try {
    // Read optional chunk config from request body
    const chunkSize = req.body?.chunkSize || 1024;
    const overlap = req.body?.overlap || 128;
    const strategy = req.body?.strategy || 'markdown';

    logger.info(`Rebuild embeddings started — strategy=${strategy} chunkSize=${chunkSize} overlap=${overlap}`);

    // Step 1: Clear all existing vectors
    const tClear = Date.now();
    await vectorRepository.clear();
    const clearedMs = Date.now() - tClear;
    console.log(`[Admin] Cleared all vectors (${clearedMs}ms)`);

    // Step 2: Load all non-deleted entries
    const { entries: allEntries } = await entryRepository.findMany({
      isInternal: true,
      page: 1,
      pageSize: 999999,
    });

    if (allEntries.length === 0) {
      res.json({
        success: true,
        message: '没有需要重建的条目（数据库为空）',
        totalEntries: 0,
        totalVectors: 0,
        totalChunks: 0,
        timing: { totalMs: Date.now() - t0 },
      });
      return;
    }

    console.log(`[Admin] Loaded ${allEntries.length} entries for rebuild`);

    // Step 3: Process each entry — chunk + embed + store
    let totalChunks = 0;
    let totalVectors = 0;
    let successCount = 0;
    let failCount = 0;
    const errors: Array<{ entryId: number; title: string; error: string }> = [];

    for (const entry of allEntries) {
      try {
        // Skip entries with no content
        if (!entry.content || entry.content.trim().length === 0) {
          continue;
        }

        // Normalize line endings (CRLF → LF) for consistent chunking
        const normalizedContent = entry.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Chunk the content
        const chunks = chunkService.chunk(normalizedContent, `entry_${entry.id}`, {
          strategy: strategy as 'markdown' | 'fixed' | 'paragraph' | 'sentence',
          chunkSize,
          overlap,
        });

        if (chunks.length === 0) continue;
        totalChunks += chunks.length;

        // Generate embeddings
        const texts = chunks.map((c) => c.text);
        const { vectors, failed } = await ollamaEmbedder.embedBatch(texts);
        const valid = vectors.filter((v) => v.length > 0);

        if (failed.length > 0) {
          for (const f of failed) {
            logger.error(`Embed failed for entry=${entry.id} chunk=${f.index}`, undefined, { entryId: entry.id, chunkIndex: f.index, error: f.error });
          }
        }

        // Store vectors
        if (valid.length > 0) {
          const records = chunks.map((c, i) => ({
            chunk_id: c.id,
            entry_id: entry.id,
            embedding: vectors[i] || [],
          }));
          await vectorRepository.insert(records);
          totalVectors += valid.length;
        }

        // Update chunk texts in DB
        await chunkRepository.deleteByEntryId(entry.id);
        await chunkRepository.saveChunks(
          entry.id,
          chunks.map((ch) => ({
            id: ch.id,
            text: ch.text,
            metadata: {
              strategy: ch.metadata.strategy,
              heading: ch.metadata.heading,
              startChar: ch.startChar,
              endChar: ch.endChar,
            },
          })),
          { deleteExisting: false },
        );

        successCount++;
        if (successCount % 10 === 0 || successCount === allEntries.length) {
          console.log(`[Admin] Rebuild progress: ${successCount}/${allEntries.length} entries`);
        }
      } catch (err: any) {
        failCount++;
        errors.push({
          entryId: entry.id,
          title: entry.title.slice(0, 80),
          error: err.message,
        });
        logger.error(`Rebuild failed for entry #${entry.id} "${entry.title.slice(0, 60)}"`, err as Error, { entryId: entry.id });
      }
    }

    const totalMs = Date.now() - t0;

    console.log(
      `[Admin] Rebuild complete — ${successCount}/${allEntries.length} entries, ` +
      `${totalChunks} chunks, ${totalVectors} vectors, ${totalMs}ms`,
    );

    res.json({
      success: true,
      message: `重建完成：${successCount}/${allEntries.length} 个条目，${totalChunks} 个分块，${totalVectors} 个向量`,
      totalEntries: allEntries.length,
      successCount,
      failCount,
      totalChunks,
      totalVectors,
      model: config.ollama.embeddingModel,
      dimension: validVectorsDimension(totalVectors > 0 ? config.embeddingDimension : 0),
      timing: {
        clearMs: clearedMs,
        totalMs,
      },
      errors: errors.slice(0, 20), // Cap errors at 20 for response size
    });
  } catch (err: any) {
    logger.error(`Rebuild embeddings failed: ${err.message}`, err as Error);
    res.status(500).json({
      success: false,
      error: 'REBUILD_FAILED',
      message: err.message,
    });
  }
});

/**
 * GET /api/admin/stats
 *
 * 管理统计信息：条目数、向量数、分块数、数据库大小等
 */
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const totalEntries = await entryRepository.count(true);

    res.json({
      entries: { total: totalEntries },
      embedding: {
        model: config.ollama.embeddingModel,
        dimension: config.embeddingDimension,
      },
      llm: {
        provider: config.llmProvider,
        model: config.llmProvider === 'deepseek' ? config.deepseek.chatModel : config.ollama.chatModel,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: 'STATS_FAILED', message: err.message });
  }
});

/**
 * GET /api/admin/logs
 *
 * 查询运行日志，支持级别/模块/关键词筛选和分页。
 * 返回 levels 和 modules 列表供前端下拉框使用。
 */
adminRouter.get('/logs', async (req: Request, res: Response) => {
  try {
    const { logRepository } = await import('../../backend/repositories/log.repository.js');
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string || '20', 10) || 20));

    const result = await logRepository.query({
      level: req.query.level as string | undefined,
      module: req.query.module as string | undefined,
      search: req.query.search as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      page,
      pageSize,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'LOGS_QUERY_FAILED', message: err.message });
  }
});

/**
 * DELETE /api/admin/logs
 *
 * 清除指定天数之前的旧日志。默认 30 天。
 */
adminRouter.delete('/logs', async (req: Request, res: Response) => {
  try {
    const { logRepository } = await import('../../backend/repositories/log.repository.js');
    const days = parseInt(req.query.olderThan as string || '30', 10);
    if (days < 1) {
      res.status(400).json({ error: 'INVALID_PARAM', message: 'olderThan must be >= 1' });
      return;
    }
    const deleted = await logRepository.deleteOlderThan(days);
    res.json({ success: true, deleted, message: `Deleted ${deleted} logs older than ${days} days` });
  } catch (err: any) {
    res.status(500).json({ error: 'LOGS_DELETE_FAILED', message: err.message });
  }
});

/**
 * POST /api/admin/logs/test
 *
 * Write a test log entry to verify the logging pipeline is working.
 * This triggers the full chain: logger → flush queue → run_logs table.
 */
adminRouter.post('/logs/test', async (_req: Request, res: Response) => {
  try {
    const testError = new Error('Test log entry — logging pipeline verification');
    logger.info('Test log triggered via admin endpoint');
    logger.error('Test ERROR log — verify pipeline', testError, {
      source: 'manual-test',
      timestamp: new Date().toISOString(),
    });
    // Force immediate flush so the log is visible right away
    const { logRepository } = await import('../../backend/repositories/log.repository.js');
    const entry = {
      level: 'error',
      module: 'Admin',
      message: 'Test ERROR log — verify pipeline',
      stack: testError.stack || null,
      context: { source: 'manual-test', timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    };
    await logRepository.insert(entry);
    res.json({ success: true, message: 'Test log written — check GET /api/admin/logs' });
  } catch (err: any) {
    res.status(500).json({ error: 'TEST_LOG_FAILED', message: err.message });
  }
});

function validVectorsDimension(dim: number): number {
  return dim > 0 ? dim : config.embeddingDimension;
}
