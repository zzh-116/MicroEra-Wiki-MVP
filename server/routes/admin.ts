// Admin Routes — 管理运维操作（重建索引、批量操作等）
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { chunkRepository } from '../../backend/repositories/chunk.repository.js';
import { vectorRepository } from '../../backend/repositories/vector.repository.js';
import { chunkService } from '../../backend/chunk/service.js';
import { ollamaEmbedder } from '../../backend/embedding/ollama.js';
import { config } from '../../backend/config.js';

export const adminRouter = Router();

// All admin routes require authentication
adminRouter.use(requireAuth);

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

    console.log(`[Admin] Rebuild embeddings started — strategy=${strategy} chunkSize=${chunkSize} overlap=${overlap}`);

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
        const vecs = await ollamaEmbedder.embedBatch(texts);
        const valid = vecs.filter((v) => v.length > 0);

        // Store vectors
        if (valid.length > 0) {
          const records = chunks.map((c, i) => ({
            chunk_id: c.id,
            entry_id: entry.id,
            embedding: vecs[i] || [],
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
        console.error(`[Admin] Rebuild failed for entry #${entry.id} "${entry.title.slice(0, 60)}": ${err.message}`);
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
      dimension: validVectorsDimension(totalVectors > 0 ? config.milvus.dimension : 0),
      timing: {
        clearMs: clearedMs,
        totalMs,
      },
      errors: errors.slice(0, 20), // Cap errors at 20 for response size
    });
  } catch (err: any) {
    console.error(`[Admin] Rebuild embeddings failed: ${err.message}`);
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
        dimension: config.milvus.dimension,
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

function validVectorsDimension(dim: number): number {
  return dim > 0 ? dim : config.milvus.dimension;
}
