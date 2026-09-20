import { Router, Request, Response } from 'express';
import { searchService } from '../../backend/services/search.service.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { optionalAuth } from '../middleware/auth.js';
import type { Entry } from '../../backend/types.js';

export const searchRouter = Router();

searchRouter.post('/', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { query, type, searchMode } = req.body || {};
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

    // Mode dispatch — 'title' (按标题/文件名), 'keyword' (按内容), 'nlp'/default (智能)
    const mode = searchMode === 'title' ? 'title' : searchMode === 'keyword' ? 'keyword' : 'nlp';
    const q = query.trim();
    let entries: Entry[];
    if (mode === 'title') {
      entries = await searchService.titleSearch(q, req.isInternal, 10);
    } else if (mode === 'keyword') {
      entries = await searchService.contentSearch(q, req.isInternal, 10);
    } else {
      entries = await searchService.smartSearch(q, req.isInternal, 10);
    }

    // Optional type filter (parity with the old semantic path)
    if (type && type !== 'all') {
      entries = entries.filter((e) => e.entry_type === type);
    }

    const items = entries.map((e) => ({
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

    res.json({
      results: items,
      page: 1,
      pageSize: 10,
      total: items.length,
      totalPages: 1,
      source: mode === 'title' ? 'title' : mode === 'keyword' ? 'content' : 'smart',
    });
  } catch (err: any) {
    res.status(503).json({ error: 'SEARCH_UNAVAILABLE', message: err.message });
  }
});
