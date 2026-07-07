// Prompt templates for AI features
import { Entry, ChatMessage } from '../types.js';

/** Build a compact search result snippet — only title + summary + key tags */
function formatEntryForChat(e: Entry): string {
  const contentPreview = e.content.length > 600 ? e.content.slice(0, 600) + '...' : e.content;
  return `【${e.title}】\n摘要: ${e.summary}\n内容: ${contentPreview}\n标签: ${e.tags.slice(0, 5).join(', ')}`;
}

/** System prompt for the RAG chat */
export function buildChatSystemPrompt(entries: Entry[]): string {
  const kb = entries.map(formatEntryForChat).join('\n\n');
  return `你是微观纪元（MicroEra Wiki）的企业知识助手。基于以下知识库回答用户问题。要求：
1. 简洁直接，2-3 段
2. 每条信息末尾标注来源，格式：(来源: 条目标题)
3. 不知道就说不知道

===== 知识库 =====
${kb}
===== 知识库结束 =====\n\n现在回答用户问题。`;

}

/** Messages for summarization */
export function buildSummarizeMessages(entry: Entry): ChatMessage[] {
  return [
    {
      role: 'system',
      content: '你是一个专业的企业 Wiki 摘要助手。请用 2-3 句简洁的话总结给定的条目内容。根据条目语言自动选择中文或英文回复。',
    },
    {
      role: 'user',
      content: `请总结以下 Wiki 条目：\n\n标题：${entry.title}\n类型：${entry.entry_type}\n内容：\n${entry.content.slice(0, 2000)}`,
    },
  ];
}

/** Messages for AI semantic search (deprecated in favor of vector search, kept as fallback) */
export function buildSearchMessages(entries: Entry[], query: string): ChatMessage[] {
  const formatted = entries
    .map((e) => `[ID:${e.id}] 标题:${e.title} | 类型:${e.entry_type} | 标签:${e.tags.join(',')}\n摘要:${e.summary}\n内容:${e.content.slice(0, 800)}`)
    .join('\n---\n');

  return [
    {
      role: 'system',
      content: '你是一个企业 Wiki 搜索引擎。根据用户查询，从给定的条目列表中找出最相关的条目。只返回一个 JSON 数组，包含相关的条目 ID，按相关性从高到低排列。例如：[1, 4, 2]。不要返回任何其他文字。',
    },
    {
      role: 'user',
      content: `以下是所有可搜索的 Wiki 条目：\n\n${formatted}\n\n用户查询："${query}"\n\n请返回最相关条目的 ID 数组（JSON 格式）：`,
    },
  ];
}
