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

/** Number of lines to process before yielding to the event loop */
const YIELD_INTERVAL = 200;

/** Yield to the browser event loop to keep the UI responsive */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    // Use scheduler.yield() if available (Node 20.11+/React 19),
    // otherwise fall back to setTimeout 0 which is universally supported.
    if (typeof globalThis.scheduler !== 'undefined' && 'yield' in globalThis.scheduler) {
      (globalThis.scheduler as any).yield().then(resolve).catch(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Fast single-char/char-range check for whether a (trimmed) line opens a
 * special markdown block. Avoids regex on the hot path — full-line regex
 * was responsible for the main-thread saturation that survived chunked
 * yielding: every `.match()` calls into the JS engine's regex interpreter.
 *
 * Returns the block "tag" the line belongs to, or 0 for ordinary paragraph.
 *
 * Tags:
 *   'h'  heading           (#, 1–4)
 *   'c'  code fence        (```)
 *   't'  table             (|)
 *   'q'  blockquote        (>)
 *   'd'  hr                (--- / *** / ___)
 *   'u'  unordered list    (- / * / +)
 *   'o'  ordered list      (digit + . or ))
 *   'i'  image             (![
 */
function classifyLine(t: string): 0 | 'h' | 'c' | 't' | 'q' | 'd' | 'u' | 'o' | 'i' {
  if (t.length === 0) return 0;
  const c0 = t.charCodeAt(0);
  // `#` → heading
  if (c0 === 35) return 'h';
  // ``` → code
  if (c0 === 96 && t[1] === '`' && t[2] === '`') return 'c';
  // `|` → table
  if (c0 === 124) return 't';
  // `>` → blockquote
  if (c0 === 62 && t[1] === ' ') return 'q';
  // `!` → image
  if (c0 === 33 && t[1] === '[') return 'i';
  // `-` `*` `_`
  if (c0 === 45 /* - */ || c0 === 42 /* * */) {
    // horizontal rule: 3+ of same
    if (t.length >= 3 && (t[1] === t[0] && t[2] === t[0])) return 'd';
    // unordered list: marker + space
    if (t[1] === ' ') return 'u';
    return 0;
  }
  if (c0 === 95 /* _ */ && t.length >= 3 && t[1] === '_' && t[2] === '_') return 'd';
  // digit → ordered list
  if (c0 >= 48 && c0 <= 57) {
    const len = t.length;
    let k = 1;
    while (k < len && t.charCodeAt(k) >= 48 && t.charCodeAt(k) <= 57) k++;
    if (k > 1 && k < len && (t[k] === '.' || t[k] === ')') && t[k + 1] === ' ') return 'o';
    return 0;
  }
  // unordered list via `+ `
  if (c0 === 43 /* + */ && t[1] === ' ') return 'u';
  return 0;
}

/**
 * Parse raw content string into structured ContentBlock[].
 * Processes in chunks of YIELD_INTERVAL lines, yielding to the event loop
 * between chunks so the UI remains responsive for large documents.
 */
export async function parseContent(raw: string): Promise<ContentBlock[]> {
  if (!raw || !raw.trim()) return [];

  // Yield first so the LCP painting pipeline isn't starved behind
  // the synchronous stripNoise() regex passes on very large inputs.
  await yieldToEventLoop();

  // Step 0: Strip base64 data URIs and embedded-image placeholders entirely
  const cleaned = stripNoise(raw);

  if (!cleaned.trim()) return [];

  const blocks: ContentBlock[] = [];
  const lines = cleaned.split('\n');
  let i = 0;

  while (i < lines.length) {
    // ── Yield periodically so the UI doesn't freeze for large documents ──
    if (i > 0 && i % YIELD_INTERVAL === 0) {
      await yieldToEventLoop();
    }

    const line = lines[i];
    const trimmed = line.trim();
    const tag = classifyLine(trimmed);

    // ── Code fences ──
    if (tag === 'c') {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim().startsWith('```')) break;
        codeLines.push(next);
        i++;
      }
      i++; // skip closing ```
      if (codeLines.length > 0) {
        blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      }
      continue;
    }

    // ── Tables ──
    if (tag === 't' && lines[i + 1] && /^[\s\-:|]+$/.test(lines[i + 1].trim())) {
      const headerLine = trimmed;
      i += 2; // skip header + separator
      const headers = headerLine.split('|').filter(Boolean).map((h) => h.trim());
      const rows: string[][] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim().startsWith('|')) break;
        rows.push(next.split('|').filter(Boolean).map((c) => c.trim()));
        i++;
      }
      if (headers.length > 0) {
        blocks.push({ type: 'table', headers, rows });
      }
      continue;
    }

    // ── Headings ──
    if (tag === 'h') {
      const hashes = trimmed.match(/^#+/);
      const level = Math.min(hashes ? hashes[0].length : 1, 4) as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, text: trimmed.slice(level).trim() });
      i++;
      continue;
    }

    // ── Blockquote ──
    if (tag === 'q') {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (!next.startsWith('> ')) break;
        quoteLines.push(next.slice(2));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    // ── Horizontal rule ──
    if (tag === 'd') {
      blocks.push({ type: 'divider' });
      i++;
      continue;
    }

    // ── Unordered list ──
    if (tag === 'u') {
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        const nt = next.trim();
        if (nt.length === 0) break;
        if (classifyLine(nt) !== 'u') break;
        items.push(nt.replace(/^[-*+]\s*/, ''));
        i++;
      }
      blocks.push({ type: 'list', items, ordered: false });
      continue;
    }

    // ── Ordered list ──
    if (tag === 'o') {
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        const nt = next.trim();
        if (nt.length === 0) break;
        if (classifyLine(nt) !== 'o') break;
        items.push(nt.replace(/^\d+[.)]\s*/, ''));
        i++;
      }
      blocks.push({ type: 'list', items, ordered: true });
      continue;
    }

    // ── Image (markdown syntax with real URL) ──
    // Accept: http(s)://, protocol-relative //, or root-relative /api/...
    // (the last form is what docling emits after extractAndSaveImages).
    if (tag === 'i') {
      const imgMatch = trimmed.match(/^!\[([^\]]*)\](\(((?:https?:)?\/\/[^)]+|\/[^)]+)\))/);
      if (imgMatch) {
        blocks.push({ type: 'image', alt: imgMatch[1], src: imgMatch[3] });
        i++;
        continue;
      }
      // fall through to paragraph if it didn't actually match an image URL
    }

    // ── Blank line ──
    if (trimmed.length === 0) {
      i++;
      continue;
    }

    // ── Paragraph (accumulate consecutive non-special lines) ──
    const paraLines: string[] = [];
    while (i < lines.length) {
      const next = lines[i];
      const nt = next.trim();
      if (nt.length === 0) break;
      if (classifyLine(nt) !== 0) break;
      paraLines.push(next);
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

  // Strip leading YAML frontmatter (--- ... ---) so its keys/values never
  // become content or keyword links.
  result = result.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

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
