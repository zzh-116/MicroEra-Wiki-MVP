import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchEntries } from './_shared/mockData.js';
import { authenticate } from './_shared/auth.js';
import { handleOptions } from './_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' });
    return;
  }

  const { query } = (req.body || {}) as { query?: string };

  if (!query || !query.trim()) {
    res.status(200).json({ results: [], source: 'keyword_demo' });
    return;
  }

  const payload = authenticate(req.headers as Record<string, string | undefined>);
  const isInternal = !!payload;

  const result = searchEntries(query, isInternal);
  res.status(200).json(result);
}
