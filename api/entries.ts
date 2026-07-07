import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEntries, addEntry, getEntryById } from './_shared/mockData.js';
import { authenticate } from './_shared/auth.js';
import { handleOptions } from './_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method === 'GET') {
    const payload = authenticate(req.headers as Record<string, string | undefined>);
    const isInternal = !!payload;

    const { keyword, entry_type, visibility, category_id, tag } = req.query as Record<string, string | undefined>;

    const entries = getEntries({ keyword, entry_type, visibility, category_id, tag }, isInternal);
    res.status(200).json(entries);
    return;
  }

  if (req.method === 'POST') {
    const payload = authenticate(req.headers as Record<string, string | undefined>);
    if (!payload) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
      return;
    }

    try {
      const entry = addEntry(req.body);
      res.status(201).json(entry);
    } catch {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid request body' });
    }
    return;
  }

  res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET and POST are allowed' });
}
