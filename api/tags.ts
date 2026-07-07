import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTags } from './_shared/mockData.js';
import { handleOptions } from './_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET is allowed' });
    return;
  }

  res.status(200).json(getTags());
}
