import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEntryById, updateEntry, deleteEntry } from '../_shared/mockData.js';
import { authenticate } from '../_shared/auth.js';
import { handleOptions } from '../_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  const id = parseInt(req.query.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid entry ID' });
    return;
  }

  if (req.method === 'GET') {
    const payload = authenticate(req.headers as Record<string, string | undefined>);
    const isInternal = !!payload;

    const entry = getEntryById(id);
    if (!entry) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Entry not found' });
      return;
    }

    if (entry.visibility === 'internal' && !isInternal) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied — login required' });
      return;
    }

    res.status(200).json(entry);
    return;
  }

  if (req.method === 'PUT') {
    const payload = authenticate(req.headers as Record<string, string | undefined>);
    if (!payload) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
      return;
    }

    const updated = updateEntry(id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Entry not found' });
      return;
    }

    res.status(200).json(updated);
    return;
  }

  if (req.method === 'DELETE') {
    const payload = authenticate(req.headers as Record<string, string | undefined>);
    if (!payload) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
      return;
    }

    const deleted = deleteEntry(id);
    if (!deleted) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Entry not found' });
      return;
    }

    res.status(200).json({ success: true });
    return;
  }

  res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET, PUT, and DELETE are allowed' });
}
