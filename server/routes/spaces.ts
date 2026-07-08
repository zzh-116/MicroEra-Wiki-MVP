import { Router, Request, Response } from 'express';
import { categoryRepository } from '../../backend/repositories/category.repository.js';
import { optionalAuth } from '../middleware/auth.js';
export const spacesRouter = Router();
spacesRouter.get('/', optionalAuth, async (_req: Request, res: Response) => {
  const cats = await categoryRepository.findAll();
  const children = cats.map((c) => ({ id: `s-cat-${c.id}`, name: c.name, description: c.description || '', parentId: 'root', visibility: 'internal' as const, children: [] }));
  res.json([{ id: 'root', name: '微观纪元 Wiki', description: '企业知识门户根目录', parentId: undefined, visibility: 'internal' as const, children }]);
});
