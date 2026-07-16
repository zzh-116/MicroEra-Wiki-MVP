import { Router, Request, Response } from 'express';
import { aiService } from '../../backend/services/ai.service.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { optionalAuth } from '../middleware/auth.js';

export const searchRouter = Router();

searchRouter.post('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { query, type } = req.body || {};
    const { tag } = req.body || {};
    const hasQuery = query?.trim();

    // If no query, query the database directly (supports type filter or all)
    if (!hasQuery) {
      const { page, pageSize } = req.body || {};
      const pg = Math.max(1, parseInt(page || '1', 10) || 1);
      const ps = Math.min(100, Math.max(1, parseInt(pageSize || '10', 10) || 10));
      const result = await entryRepository.findMany({
        entry_type: type && type !== 'all' ? type : undefined,
        tag: tag,
        isInternal: req.isInternal,
        page: pg,
        pageSize: ps,
      });
      const items = result.entries.map((e) => ({
        id: e.id,
        title: e.title,
        entry_type: e.entry_type,
        summary: e.summary,
        content: e.content.slice(0, 500),
        visibility: e.visibility,
        category_id: e.category_id,
        created_at: e.created_at,
        updated_at: e.updated_at,
        tags: e.tags,
      }));
      res.json({ results: items, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages, source: 'database' });
      return;
    }

    // Semantic search with optional type filter
    const results = await aiService.search(query.trim());
    // If semantic search returns 0 results, fall back to keyword search
    let finalResults = results;
    if (finalResults.length === 0) {
      const { page, pageSize } = req.body || {};
      const pg = Math.max(1, parseInt(page || '1', 10) || 1);
      const ps = Math.min(100, Math.max(1, parseInt(pageSize || '10', 10) || 10));
      const keywordResult = await entryRepository.findMany({
        keyword: query.trim(),
        entry_type: type && type !== 'all' ? type : undefined,
        tag: tag,
        isInternal: req.isInternal,
        page: pg,
        pageSize: ps,
      });
      finalResults = keywordResult.entries.map((e) => ({
        id: e.id,
        title: e.title,
        entry_type: e.entry_type,
        summary: e.summary,
        content: e.content.slice(0, 500),
        visibility: e.visibility,
        category_id: e.category_id,
        created_at: e.created_at,
        updated_at: e.updated_at,
        tags: e.tags,
      }));
      res.json({ results: finalResults, page: keywordResult.page, pageSize: keywordResult.pageSize, total: keywordResult.total, totalPages: keywordResult.totalPages, source: 'keyword' });
      return;
    }
    if (type) {
      res.json({
        results: finalResults.filter((r: any) => r.entry_type === type),
        source: 'semantic',
      });
    } else {
      res.json({ results: finalResults, source: 'semantic' });
    }
  } catch (err: any) {
    res.status(503).json({ error: 'SEARCH_UNAVAILABLE', message: err.message });
  }
});
