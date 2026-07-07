import { Router, Request, Response } from 'express';
import { metadataStore } from '../../backend/metadata/store.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', (_req: Request, res: Response) => {
  res.json(metadataStore.getCategories());
});
