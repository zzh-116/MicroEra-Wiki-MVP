import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchEntries, type Entry } from '../_shared/mockData.js';
import { handleOptions } from '../_shared/cors.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function formatEntryForChat(e: Entry): string {
  const contentPreview = e.content.length > 600 ? e.content.slice(0, 600) + '...' : e.content;
  return `【${e.title}】\n摘要: ${e.summary}\n内容: ${contentPreview}\n标签: ${e.tags.slice(0, 5).join(', ')}`;
}

function buildSystemPrompt(entries: Entry[]): string {
  const kb = entries.map(formatEntryForChat).join('\n\n');
  return `你是微观纪元（MicroEra Wiki）的企业知识助手。基于以下知识库回答用户问题。要求：
1. 简洁直接，2-3 段
2. 每条信息末尾标注来源，格式：(来源: 条目标题)
3. 不知道就说不知道

===== 知识库 =====
${kb}
===== 知识库结束 =====

现在回答用户问题。`;
}

async function callDeepSeek(messages: ChatMessage[], temperature = 0.7): Promise<string> {
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
      max_tokens: 1024,
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

  const { question, history } = (req.body || {}) as { question?: string; history?: ChatMessage[] };

  if (!question || !question.trim()) {
    res.status(200).json({ answer: '请提出一个问题。', sources: [] });
    return;
  }

  // If no API key configured, fall back to demo mode
  if (!DEEPSEEK_API_KEY) {
    res.status(200).json({
      answer: `[Demo 模式] 这是一个模拟的 AI 回复。您的问题是：「${question}」\n\n在生产环境中，此端点将连接到 Ollama LLM（qwen2.5:7b / deepseek-r1:8b）进行基于企业知识库的 RAG 问答。系统会先从向量库中检索最相关的 3 个文档片段，构建上下文后由大模型生成回答并附上引用来源。\n\n如需体验完整 AI 功能，请设置 DEEPSEEK_API_KEY 环境变量。`,
      sources: [],
    });
    return;
  }

  try {
    // Mini-RAG: search relevant entries as context
    const searchResult = searchEntries(question, true);
    const topEntries = searchResult.results.slice(0, 3).map((r) => r.entry);

    const messages: ChatMessage[] = [
      ...(topEntries.length > 0 ? [{ role: 'system' as const, content: buildSystemPrompt(topEntries) }] : []),
      ...(history || []).slice(-10),
      { role: 'user', content: question },
    ];

    const answer = await callDeepSeek(messages, 0.7);

    res.status(200).json({
      answer,
      sources: topEntries.map((e) => ({ id: e.id, title: e.title })),
    });
  } catch (err: any) {
    console.error('DeepSeek chat error:', err);
    res.status(200).json({
      answer: `[AI 服务暂时不可用] ${err.message || '未知错误'}\n\n请检查 DEEPSEEK_API_KEY 是否有效，或稍后重试。`,
      sources: [],
    });
  }
}
