import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate } from '../_shared/auth.js';
import { getUser } from '../_shared/mockData.js';
import { handleOptions } from '../_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only GET is allowed' });
    return;
  }

  const payload = authenticate(req.headers as Record<string, string | undefined>);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid token' });
    return;
  }

  const user = getUser();
  res.status(200).json({ isLoggedIn: true, user });
}
