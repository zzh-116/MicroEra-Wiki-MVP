// ContentParser — converts raw content (Markdown, HTML, mixed) into structured ContentBlock[].
// Components render ContentBlock[], never raw strings. This ensures:
//   - No [Embedded image: Image] placeholder text
//   - No base64 data URIs in DOM
//   - No raw JSON dumped as text
//   - Images, code, tables rendered by appropriate components

// ---- Types ----

export type ContentBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'code'; language: string; code: string }
  | { type: 'image'; src: string; alt: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'blockquote'; text: string }
  | { type: 'divider' }
  | { type: 'html'; html: string }; // For trusted HTML content

/** Parse raw content string into structured blocks */
export function parseContent(raw: string): ContentBlock[] {
  if (!raw || !raw.trim()) return [];

  // Step 0: Strip base64 data URIs and embedded-image placeholders entirely
  const cleaned = stripNoise(raw);

  if (!cleaned.trim()) return [];

  const blocks: ContentBlock[] = [];
  const lines = cleaned.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Code fences ──
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      if (codeLines.length > 0) {
        blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      }
      continue;
    }

    // ── Tables ──
    if (line.trim().startsWith('|') && lines[i + 1]?.trim().match(/^\|[\s\-:|]+\|$/)) {
      const headerLine = line;
      i += 2; // skip header + separator
      const headers = headerLine.split('|').filter(Boolean).map((h) => h.trim());
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].split('|').filter(Boolean).map((c) => c.trim()));
        i++;
      }
      if (headers.length > 0) {
        blocks.push({ type: 'table', headers, rows });
      }
      continue;
    }

    // ── Headings ──
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    // ── Blockquote ──
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    // ── Horizontal rule ──
    if (line.trim().match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      blocks.push({ type: 'divider' });
      i++;
      continue;
    }

    // ── Unordered list ──
    if (line.match(/^[-*+]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*+]\s/)) {
        items.push(lines[i].replace(/^[-*+]\s*/, ''));
        i++;
      }
      blocks.push({ type: 'list', items, ordered: false });
      continue;
    }

    // ── Ordered list ──
    if (line.match(/^\d+[.)]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+[.)]\s/)) {
        items.push(lines[i].replace(/^\d+[.)]\s*/, ''));
        i++;
      }
      blocks.push({ type: 'list', items, ordered: true });
      continue;
    }

    // ── Image (markdown syntax with real URL) ──
    const imgMatch = line.match(/^!\[([^\]]*)\]\((\/\/[^)]+\)|https?:\/\/[^)]+)\)/);
    if (imgMatch) {
      blocks.push({ type: 'image', alt: imgMatch[1], src: imgMatch[2] });
      i++;
      continue;
    }

    // ── Blank line ──
    if (!line.trim()) {
      i++;
      continue;
    }

    // ── Paragraph (accumulate consecutive non-special lines) ──
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !isSpecialLine(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      const text = paraLines.join('\n').trim();
      // Skip lines that are just noise
      if (!isNoiseLine(text)) {
        blocks.push({ type: 'paragraph', text });
      }
    }
  }

  return blocks;
}

// ---- Internal helpers ----

/** Strip noise that should NEVER appear in rendered output */
function stripNoise(raw: string): string {
  let result = raw;

  // Remove embedded-image placeholder lines (from stripDataUriImages)
  result = result.replace(/\[Embedded image:[^\]]*\]/gi, '');

  // Remove bare base64 data URIs
  result = result.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{50,}/gi, '');

  // Remove markdown image syntax with data: URIs (no real src)
  result = result.replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/g, '');

  // Remove raw JSON code blocks (debug data leaked into content)
  result = result.replace(/```json\n[\s\S]*?\n```/g, '');

  // Remove [object Object] noise
  result = result.replace(/\[object\s+Object\]/gi, '');

  // Collapse multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

/** Check if a line starts a special block (heading, code, list, etc.) */
function isSpecialLine(line: string): boolean {
  const t = line.trim();
  return !!(
    t.startsWith('#') ||
    t.startsWith('```') ||
    t.startsWith('|') ||
    t.startsWith('> ') ||
    t.match(/^[-*+]\s/) ||
    t.match(/^\d+[.)]\s/) ||
    t.match(/^(-{3,}|\*{3,}|_{3,})$/) ||
    t.startsWith('![')
  );
}

/** Check if a paragraph line is just noise that should be skipped */
function isNoiseLine(text: string): boolean {
  const t = text.trim().toLowerCase();
  // Pure UUID/ObjectId
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return true;
  if (/^[0-9a-f]{24}$/i.test(t)) return true;
  // Pure JSON
  if ((t.startsWith('{') || t.startsWith('[')) && t.length > 20) {
    try { JSON.parse(t); return true; } catch { /* not JSON, let it through */ }
  }
  return false;
}
