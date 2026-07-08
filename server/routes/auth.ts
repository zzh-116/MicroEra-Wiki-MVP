import { Router, Request, Response } from 'express';
import { signToken, requireAuth } from '../middleware/auth.js';
import { authService } from '../../backend/services/auth.service.js';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'MISSING_CREDENTIALS', message: '请输入用户名和密码' });
    return;
  }
  const user = await authService.login(username, password);
  if (!user) {
    res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '用户名或密码错误' });
    return;
  }
  const token = signToken({ userId: user.id, username: user.username, role: user.role });
  res.json({ token, user: { id: user.id, username: user.username, display_name: user.displayName, role: user.role } });
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await authService.getUserById(req.user!.userId);
  if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
  res.json({ isLoggedIn: true, user: { id: user.id, username: user.username, display_name: user.displayName, role: user.role } });
});
