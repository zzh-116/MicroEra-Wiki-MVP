import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import { bookmarkRepository } from '../../backend/repositories/bookmark.repository.js';

export const bookmarksRouter = Router();

// GET /api/bookmarks — list current user's bookmarked entries
bookmarksRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const entries = await bookmarkRepository.findByUser(req.user!.userId);
    res.json(entries);
  } catch (err: any) {
    console.error('[Bookmarks] GET / error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '获取收藏列表失败' });
  }
});

// POST /api/bookmarks/:entryId — bookmark an entry
bookmarksRouter.post('/:entryId', requireAuth, async (req: Request, res: Response) => {
  try {
    const entryId = Number(req.params.entryId);
    if (isNaN(entryId)) {
      res.status(400).json({ error: 'INVALID_ID', message: '无效的条目 ID' });
      return;
    }
    await bookmarkRepository.add(req.user!.userId, entryId);
    res.status(201).json({ success: true });
  } catch (err: any) {
    console.error('[Bookmarks] POST error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '收藏失败' });
  }
});

// DELETE /api/bookmarks/:entryId — remove a bookmark
bookmarksRouter.delete('/:entryId', requireAuth, async (req: Request, res: Response) => {
  try {
    const entryId = Number(req.params.entryId);
    if (isNaN(entryId)) {
      res.status(400).json({ error: 'INVALID_ID', message: '无效的条目 ID' });
      return;
    }
    await bookmarkRepository.remove(req.user!.userId, entryId);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Bookmarks] DELETE error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '取消收藏失败' });
  }
});

// GET /api/bookmarks/:entryId/status — check if an entry is bookmarked
bookmarksRouter.get('/:entryId/status', optionalAuth, async (req: Request, res: Response) => {
  try {
    const entryId = Number(req.params.entryId);
    if (isNaN(entryId)) {
      res.status(400).json({ error: 'INVALID_ID', message: '无效的条目 ID' });
      return;
    }
    if (!req.user) {
      res.json({ bookmarked: false });
      return;
    }
    const bookmarked = await bookmarkRepository.isBookmarked(req.user.userId, entryId);
    res.json({ bookmarked });
  } catch (err: any) {
    console.error('[Bookmarks] status error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '查询收藏状态失败' });
  }
});
