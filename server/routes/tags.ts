import { Router, Request, Response } from 'express';
import { tagRepository } from '../../backend/repositories/tag.repository.js';
export const tagsRouter = Router();
tagsRouter.get('/', async (_req: Request, res: Response) => {
  res.json(await tagRepository.findAll());
});
