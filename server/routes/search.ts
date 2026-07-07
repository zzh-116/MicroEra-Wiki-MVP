import { Router, Request, Response } from 'express';
import { aiService } from '../../backend/ai/service.js';

export const searchRouter = Router();

// POST /api/search — semantic document retrieval (vector + keyword fallback, no LLM)
searchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { query } = req.body || {};
    if (!query?.trim()) { res.json({ results: [] }); return; }
    const results = await aiService.search(query.trim());
    res.json({ results, source: 'semantic' });
  } catch (err: any) {
    res.status(503).json({ error: 'SEARCH_UNAVAILABLE', message: err.message });
  }
});
