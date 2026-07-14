// MarkdownGenerator — converts KnowledgeDocument into clean, structured Markdown.
// Output is the canonical embedding input and frontend display format.
// No raw JSON, no UUIDs, no [object Object] in output.

import type { KnowledgeDocument } from './types.js';

// ---- Public API ----

/**
 * Generate full Markdown for embedding/search indexing.
 * Includes all sections for maximum retrieval quality.
 */
export function toEmbeddingMarkdown(doc: KnowledgeDocument): string {
  return buildMarkdown(doc, { includeMetadata: false, includeDebugInfo: false });
}

/**
 * Generate display Markdown for frontend rendering.
 * Clean, readable, no debug noise.
 */
export function toDisplayMarkdown(doc: KnowledgeDocument): string {
  return buildMarkdown(doc, { includeMetadata: true, includeDebugInfo: false });
}

/**
 * Generate debug Markdown — includes raw metadata for dev mode.
 */
export function toDebugMarkdown(doc: KnowledgeDocument): string {
  return buildMarkdown(doc, { includeMetadata: true, includeDebugInfo: true });
}

// ---- Internal ----

interface MarkdownOptions {
  includeMetadata: boolean;
  includeDebugInfo: boolean;
}

function buildMarkdown(doc: KnowledgeDocument, opts: MarkdownOptions): string {
  const lines: string[] = [];

  // ── Title ──
  lines.push(`# ${escapeMarkdown(doc.title)}`);
  lines.push('');

  // ── Abstract ──
  if (doc.abstract) {
    lines.push(`> ${escapeMarkdown(doc.abstract)}`);
    lines.push('');
  }

  // ── Tags ──
  if (doc.tags.length > 0) {
    lines.push(`**Tags:** ${doc.tags.map((t) => `\`${t}\``).join(' ')}`);
    lines.push('');
  }

  // ── Properties ──
  if (doc.properties.length > 0) {
    // Group properties
    const grouped = groupBy(doc.properties, (p) => p.group || 'General');

    for (const [group, props] of Object.entries(grouped)) {
      if (group !== 'General') {
        lines.push(`## ${group}`);
        lines.push('');
      }
      lines.push('| Property | Value |');
      lines.push('|----------|-------|');
      for (const p of props) {
        const key = escapeMarkdown(p.key);
        const value = formatPropertyValue(p.value, p.type);
        lines.push(`| ${key} | ${value} |`);
      }
      lines.push('');
    }
  }

  // ── Body ──
  if (doc.body) {
    lines.push(doc.body);
    if (!doc.body.endsWith('\n')) lines.push('');
    lines.push('');
  }

  // ── References ──
  if (doc.references.length > 0) {
    lines.push('## 参考资料与关联');
    lines.push('');
    for (let i = 0; i < doc.references.length; i++) {
      const ref = doc.references[i];
      const typeEmoji = refTypeEmoji(ref.type);
      const desc = ref.description ? ` — ${ref.description}` : '';
      lines.push(`${i + 1}. ${typeEmoji} **${escapeMarkdown(ref.label)}**${desc}`);
    }
    lines.push('');
  }

  // ── Attachments ──
  if (doc.attachments.length > 0) {
    lines.push('## 附件');
    lines.push('');
    for (const att of doc.attachments) {
      const sizeStr = att.size ? ` (${formatBytes(att.size)})` : '';
      if (att.url) {
        lines.push(`- [${escapeMarkdown(att.name)}](${att.url})${sizeStr}`);
      } else {
        lines.push(`- ${escapeMarkdown(att.name)}${sizeStr}`);
      }
    }
    lines.push('');
  }

  // ── Metadata (display only, no debug IDs) ──
  if (opts.includeMetadata) {
    lines.push('---');
    lines.push('');
    if (doc.metadata.projectName) {
      lines.push(`**项目:** ${escapeMarkdown(doc.metadata.projectName)}`);
    }
    if (doc.author) {
      lines.push(`**作者:** ${escapeMarkdown(doc.author)}`);
    }
    if (doc.updatedAt) {
      lines.push(`**更新时间:** ${doc.updatedAt}`);
    }
    lines.push(`**来源:** ${doc.metadata.source} • ${doc.metadata.sourceType}`);
    lines.push('');
  }

  // ── Debug info (dev mode only) ──
  if (opts.includeDebugInfo) {
    lines.push('<details>');
    lines.push('<summary>🔧 调试信息 (开发者模式)</summary>');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify({
      id: doc.id,
      type: doc.type,
      sourceId: doc.metadata.sourceId,
      sourceType: doc.metadata.sourceType,
      unresolvedIds: doc.metadata.unresolvedIds,
      rawKeys: doc.metadata.rawKeys,
    }, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines.join('\n');
}

// ---- Helpers ----

function escapeMarkdown(text: string): string {
  return text
    .replace(/[|]/g, '\\|')
    .replace(/\n/g, ' ')
    .trim();
}

function formatPropertyValue(value: string, type?: string): string {
  const escaped = escapeMarkdown(value);
  if (type === 'code') return `\`${value.length > 100 ? value.slice(0, 100) + '…' : value}\``;
  return escaped;
}

function refTypeEmoji(type: string): string {
  const map: Record<string, string> = {
    citation: '📄',
    dataset: '📊',
    project: '📁',
    task: '📋',
    file: '📎',
    link: '🔗',
    other: '📌',
  };
  return map[type] || '📌';
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of arr) {
    const key = fn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
