import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions } from '../_shared/cors.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Only POST is allowed' });
    return;
  }

  const { question } = (req.body || {}) as { question?: string };

  if (!question || !question.trim()) {
    res.status(200).json({
      answer: '请提出一个问题。',
      sources: [],
    });
    return;
  }

  res.status(200).json({
    answer: `[Demo 模式] 这是一个模拟的 AI 回复。您的问题是：「${question}」\n\n在生产环境中，此端点将连接到 Ollama LLM（qwen2.5:7b / deepseek-r1:8b）进行基于企业知识库的 RAG 问答。系统会先从向量库中检索最相关的 3 个文档片段，构建上下文后由大模型生成回答并附上引用来源。\n\n如需体验完整 AI 功能，请在本机部署 Ollama 并启动后端服务。`,
    sources: [],
  });
}
