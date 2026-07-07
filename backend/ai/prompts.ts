// Prompt templates for AI features — chunk-level RAG

/** Build a compact knowledge context from retrieved chunks */
function formatChunkForChat(chunkText: string, entryTitle: string, chunkId: string): string {
  // Use the full chunk text (no arbitrary truncation)
  const cleanText = chunkText.trim();
  return `【来源: ${entryTitle}】(段落: ${chunkId})\n${cleanText}`;
}

/** System prompt for chunk-level RAG chat */
export function buildChatSystemPrompt(
  chunks: Array<{ chunkText: string; entryTitle: string; chunkId: string }>,
): string {
  const kb = chunks.map((c) => formatChunkForChat(c.chunkText, c.entryTitle, c.chunkId)).join('\n\n---\n\n');

  return `你是微观纪元（MicroEra Wiki）的企业知识助手。基于以下知识库片段回答用户问题。

===== 知识库（与查询最相关的段落）=====
${kb}
===== 知识库结束 =====

回答要求：
1. 基于上述知识库内容回答，不要编造信息
2. 如果知识库中有具体论文引用（如 [1]、(Author, Year)、参考文献等格式），请明确列出
3. 每条关键信息末尾标注来源，格式：(来源: 条目标题)
4. 如果知识库信息不足以回答，请诚实说明
5. 对于学术论文相关问题，请特别注意识别引用格式（方括号编号 [1]、作者-年份 (Smith, 2023)、脚注等）
6. 简洁直接，2-4 段

现在回答用户问题。`;
}

/** Messages for summarization */
export function buildSummarizeMessages(entry: { title: string; entry_type: string; content: string }): Array<{ role: string; content: string }> {
  return [
    {
      role: 'system',
      content: '你是一个专业的企业 Wiki 摘要助手。请用 2-3 句简洁的话总结给定的条目内容。根据条目语言自动选择中文或英文回复。对于学术论文，请包含论文的主要贡献和关键发现。',
    },
    {
      role: 'user',
      content: `请总结以下 Wiki 条目：\n\n标题：${entry.title}\n类型：${entry.entry_type}\n内容：\n${entry.content.slice(0, 3000)}`,
    },
  ];
}

/** Messages for AI semantic search (deprecated in favor of vector search, kept as fallback) */
export function buildSearchMessages(
  entries: Array<{ id: number; title: string; entry_type: string; tags: string[]; summary: string; content: string }>,
  query: string,
): Array<{ role: string; content: string }> {
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
