import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDataItems, saveDataItem } from './_shared/mockData.js';
import { authenticate } from './_shared/auth.js';
import { handleOptions } from './_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method === 'GET') {
    const payload = authenticate(req.headers as Record<string, string | undefined>);
    if (!payload) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
      return;
    }

    const entryIdParam = req.query.entry_id as string | undefined;
    const entryId = entryIdParam ? parseInt(entryIdParam, 10) : undefined;

    const items = getDataItems(isNaN(entryId as number) ? undefined : entryId);
    res.status(200).json(items);
    return;
  }

  if (req.method === 'PUT') {
    const payload = authenticate(req.headers as Record<string, string | undefined>);
    if (!payload) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
      return;
    }

    try {
      const item = saveDataItem(req.body);
      res.status(200).json(item);
    } catch {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid request body' });
    }
    return;
  }

  res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET and PUT are allowed' });
}
