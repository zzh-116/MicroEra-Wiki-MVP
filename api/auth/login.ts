import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signToken } from '../_shared/auth.js';
import { getUser, VALID_CREDENTIALS } from '../_shared/mockData.js';
import { handleOptions } from '../_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' });
    return;
  }

  try {
    const { username, password } = req.body || {};

    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
      const token = signToken({ userId: 1, username: 'admin' });
      const user = getUser();
      res.status(200).json({ token, user });
    } else {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '用户名或密码错误' });
    }
  } catch {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid request body' });
  }
}
