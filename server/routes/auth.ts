import { Router, Request, Response } from 'express';
import { signToken, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const MOCK_USER = {
  id: 1,
  username: 'admin',
  password: 'admin123',
  display_name: '内部测试用户',
};

authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (username === MOCK_USER.username && password === MOCK_USER.password) {
    const token = signToken({ userId: MOCK_USER.id, username: MOCK_USER.username });
    res.json({
      token,
      user: {
        id: MOCK_USER.id,
        username: MOCK_USER.username,
        display_name: MOCK_USER.display_name,
        created_at: '2026-06-10T01:57:11Z',
      },
    });
    return;
  }
  res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '用户名或密码错误' });
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    isLoggedIn: true,
    user: {
      id: req.user!.userId,
      username: req.user!.username,
      display_name: MOCK_USER.display_name,
      created_at: '2026-06-10T01:57:11Z',
    },
  });
});
