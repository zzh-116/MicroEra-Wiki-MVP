import { Router, Request, Response } from 'express';
import { metadataStore } from '../../backend/metadata/store.js';

export const tagsRouter = Router();

tagsRouter.get('/', (_req: Request, res: Response) => {
  res.json(metadataStore.getTags());
});
