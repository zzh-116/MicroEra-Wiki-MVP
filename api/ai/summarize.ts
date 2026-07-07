import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEntryById } from '../_shared/mockData.js';
import { handleOptions } from '../_shared/cors.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callDeepSeek(messages: ChatMessage[], temperature = 0.3): Promise<string> {
  const response = await fetch(DEEPSEEK_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: 512,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`DeepSeek API error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

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

  // If no API key configured, fall back to demo mode
  if (!DEEPSEEK_API_KEY) {
    res.status(200).json({
      summary: `[Demo 模式] 「${entry.title}」的摘要：${entry.summary}\n\n（生产环境中，此端点将调用 DeepSeek API 对条目正文进行智能摘要生成。请设置 DEEPSEEK_API_KEY 环境变量以启用。）`,
    });
    return;
  }

  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: '你是一个专业的企业 Wiki 摘要助手。请用 2-3 句简洁的话总结给定的条目内容。根据条目语言自动选择中文或英文回复。',
      },
      {
        role: 'user',
        content: `请总结以下 Wiki 条目：\n\n标题：${entry.title}\n类型：${entry.entry_type}\n内容：\n${entry.content.slice(0, 2000)}`,
      },
    ];

    const summary = await callDeepSeek(messages, 0.3);

    res.status(200).json({ summary });
  } catch (err: any) {
    console.error('DeepSeek summarize error:', err);
    // Fall back to existing summary on error
    res.status(200).json({
      summary: `[AI 摘要暂不可用] ${entry.summary}\n\n（${err.message || '未知错误'}）`,
    });
  }
}
