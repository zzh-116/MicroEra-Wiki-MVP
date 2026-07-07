import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEntryById } from '../_shared/mockData.js';
import { handleOptions } from '../_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' });
    return;
  }

  const { entryId } = (req.body || {}) as { entryId?: number };

  if (!entryId) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'entryId is required' });
    return;
  }

  const entry = getEntryById(entryId);
  if (!entry) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Entry not found' });
    return;
  }

  // In demo mode, return the existing summary as the AI summary
  res.status(200).json({
    summary: `[Demo 模式] 「${entry.title}」的摘要：${entry.summary}\n\n（生产环境中，此端点将调用 Ollama LLM 对条目正文进行智能摘要生成。）`,
  });
}
