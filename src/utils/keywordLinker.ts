// Keyword linker: turns Wiki entry titles appearing in plain text into links
// to /entry/:id. It only runs on already-parsed text blocks, so code blocks,
// images and tables are never touched. Inside plain text it also skips URLs,
// markdown links/images, inline code and HTML tags.

export interface KeywordTarget {
  id: string;
  title: string;
}

export type KeywordLinkPart =
  | { type: 'text'; text: string }
  | { type: 'link'; text: string; entryId: string; title: string };

interface TrieNode {
  children: Map<string, TrieNode>;
  targets?: KeywordTarget[];
}

export interface KeywordIndex {
  trie: TrieNode;
  maxLen: number;
}

export function normalizeKeyword(title: string): string {
  return (title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildTrie(entries: Array<{ id: string | number; title?: string }>): KeywordIndex {
  const root: TrieNode = { children: new Map() };
  let maxLen = 0;
  for (const entry of entries) {
    const title = (entry.title || '').trim();
    const key = normalizeKeyword(title);
    if (!key) continue;
    let node = root;
    for (const ch of key) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map() };
        node.children.set(ch, next);
      }
      node = next;
    }
    if (!node.targets) node.targets = [];
    node.targets.push({ id: String(entry.id), title });
    maxLen = Math.max(maxLen, key.length);
  }
  return { trie: root, maxLen };
}

export function buildKeywordIndex(entries: Array<{ id: string | number; title?: string }>): KeywordIndex {
  return buildTrie(entries);
}

const SKIP_TOKEN =
  /!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)|`[^`\n]*`|https?:\/\/[^\s<]+|www\.[^\s<]+|<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;

function isAsciiWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/** Split plain text into protected spans (links/code/urls/html) and linkable spans. */
function matchKeywordAt(
  lower: string,
  original: string,
  start: number,
  index: KeywordIndex,
  currentEntryId?: string,
): { len: number; target: KeywordTarget | null } | null {
  let node = index.trie;
  let best: { len: number; target: KeywordTarget | null } | null = null;
  const end = Math.min(lower.length, start + index.maxLen);
  for (let i = start; i < end; i++) {
    const next = node.children.get(lower[i]);
    if (!next) break;
    node = next;
    if (!node.targets || node.targets.length === 0) continue;

    const before = start > 0 ? original[start - 1] : '';
    const after = i + 1 < original.length ? original[i + 1] : '';
    if (isAsciiWordChar(before) || isAsciiWordChar(after)) continue;

    const target = node.targets.find((t) => String(t.id) !== String(currentEntryId)) || null;
    best = { len: i - start + 1, target };
  }
  return best;
}

function appendPlain(
  parts: KeywordLinkPart[],
  span: string,
  index: KeywordIndex,
  currentEntryId?: string,
): void {
  const lower = span.toLowerCase();
  let i = 0;
  while (i < span.length) {
    const match = matchKeywordAt(lower, span, i, index, currentEntryId);
    if (match) {
      if (match.target) {
        parts.push({
          type: 'link',
          text: match.target.title,
          entryId: match.target.id,
          title: match.target.title,
        });
      } else {
        // Longest match is the current entry's own title: keep it plain and
        // do not fall back to shorter overlapping keywords.
        parts.push({ type: 'text', text: span.slice(i, i + match.len) });
      }
      i += match.len;
      continue;
    }
    const start = i;
    while (i < span.length && !index.trie.children.has(lower[i])) i++;
    if (i === start) i++;
    parts.push({ type: 'text', text: span.slice(start, i) });
  }
}

export function findKeywordLinks(
  text: string,
  index: KeywordIndex | undefined,
  currentEntryId?: string,
): KeywordLinkPart[] {
  if (!text || !index || index.maxLen === 0) {
    return [{ type: 'text', text: text || '' }];
  }

  const parts: KeywordLinkPart[] = [];
  let last = 0;
  SKIP_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SKIP_TOKEN.exec(text)) !== null) {
    if (match.index > last) {
      appendPlain(parts, text.slice(last, match.index), index, currentEntryId);
    }
    parts.push({ type: 'text', text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    appendPlain(parts, text.slice(last), index, currentEntryId);
  }
  return parts;
}
