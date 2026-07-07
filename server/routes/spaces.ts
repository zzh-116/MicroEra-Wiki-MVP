import { Router, Request, Response } from 'express';
import { metadataStore } from '../../backend/metadata/store.js';
import { optionalAuth } from '../middleware/auth.js';

export const spacesRouter = Router();

/**
 * GET /api/spaces
 * Returns a tree of wiki spaces derived from categories.
 * Public if unauthenticated, all if authenticated.
 */
spacesRouter.get('/', optionalAuth, (_req: Request, res: Response) => {
  const categories = metadataStore.getCategories();

  const children = categories.map((c) => ({
    id: `s-cat-${c.id}`,
    name: c.name,
    description: c.description || '',
    parentId: 'root',
    visibility: 'internal' as const,
    children: [],
  }));

  const root = {
    id: 'root',
    name: '微观纪元 Wiki',
    description: '企业知识门户根目录',
    parentId: undefined,
    visibility: 'internal' as const,
    children,
  };

  res.json([root]);
});
