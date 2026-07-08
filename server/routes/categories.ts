import { Router, Request, Response } from 'express';
import { categoryRepository } from '../../backend/repositories/category.repository.js';
export const categoriesRouter = Router();
categoriesRouter.get('/', async (_req: Request, res: Response) => {
  res.json(await categoryRepository.findAll());
});
