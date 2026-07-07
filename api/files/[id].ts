import type { VercelRequest, VercelResponse } from '@vercel/node';
import { deleteFile } from '../_shared/mockData.js';
import { authenticate } from '../_shared/auth.js';
import { handleOptions } from '../_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only DELETE is allowed' });
    return;
  }

  const payload = authenticate(req.headers as Record<string, string | undefined>);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
    return;
  }

  const id = parseInt(req.query.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid file ID' });
    return;
  }

  const deleted = deleteFile(id);
  if (!deleted) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'File not found' });
    return;
  }

  res.status(200).json({ success: true });
}
