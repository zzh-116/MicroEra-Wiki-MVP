import { Router, Request, Response } from 'express';
import { aiService } from '../../backend/services/ai.service.js';
export const searchRouter = Router();
searchRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { query } = req.body || {};
    if (!query?.trim()) { res.json({ results: [] }); return; }
    res.json({ results: await aiService.search(query.trim()), source: 'semantic' });
  } catch (err: any) {
    res.status(503).json({ error: 'SEARCH_UNAVAILABLE', message: err.message });
  }
});
