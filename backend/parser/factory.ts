// Parser Factory — pluggable registry for DocumentParser implementations
//
// To add a new parser (MinerU, LlamaParse, Unstructured, etc.):
//   1. Implement DocumentParser from './base.js'
//   2. Register here: ParserFactory.register('my-parser', () => new MyParser());
//   3. Set env: PARSER_PROVIDER=my-parser
//
// No changes needed in ImportService, routes, or any downstream consumer.
import type { DocumentParser } from './base.js';
import type { InputFormat } from './models.js';
import { DoclingParser } from './docling.js';
import { TextFallbackParser } from './text.js';

const registry = new Map<string, () => DocumentParser>();

export class ParserFactory {
  /** Register a parser implementation */
  static register(name: string, factory: () => DocumentParser): void {
    registry.set(name, factory);
    console.log(`[ParserFactory] Registered: "${name}"`);
  }

  /** Create a parser instance by name */
  static create(name: string): DocumentParser {
    const factoryFn = registry.get(name);
    if (!factoryFn) {
      const available = [...registry.keys()].join(', ');
      throw new Error(`Unknown parser "${name}". Available: ${available || '(none)'}`);
    }
    return factoryFn();
  }

  /** List all registered parser names */
  static list(): string[] {
    return [...registry.keys()];
  }
}

// ---- Register built-in parsers ----
ParserFactory.register('docling', () => new DoclingParser());
ParserFactory.register('text', () => new TextFallbackParser());

// ---- Singleton accessor (backward compatible with existing code) ----

let _parser: DocumentParser | null = null;

/**
 * Get the active DocumentParser singleton.
 * Controlled by PARSER_PROVIDER env var (default: 'docling').
 */
export function getParser(): DocumentParser {
  if (_parser) return _parser;

  const provider = process.env.PARSER_PROVIDER || 'docling';
  _parser = ParserFactory.create(provider);
  console.log(`[Parser] Active: ${_parser.name} (v${_parser.version})`);
  return _parser;
}

/** Reset the parser singleton (for testing or hot-swap) */
export function resetParser(): void {
  _parser = null;
}

// ---- Format-aware fallback resolver (P2-01) ----

/** Text formats that the dependency-free TextFallback adapter can always handle. */
const TEXT_FALLBACK_FORMATS: Set<InputFormat> = new Set(['md', 'txt', 'csv', 'asciidoc']);

/**
 * Pick a parser that can actually parse the given file, preferring the
 * configured provider but falling back to the TextFallback adapter for text
 * formats when Docling is unavailable. Binary formats always require Docling.
 *
 * This is the single decision point that keeps ingestion resilient: a missing
 * Docling install degrades only binary parsing, never text ingestion.
 */
export async function getParserForFile(fileName: string, format?: InputFormat): Promise<DocumentParser> {
  const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
  const fmt = format ?? (ext ? extToFormat(ext) : 'auto');

  // Binary / image / structured formats need Docling; text formats can fall back.
  if (TEXT_FALLBACK_FORMATS.has(fmt)) {
    const preferred = getParser();
    if (preferred.name === 'TextFallback') return preferred;
    if (await preferred.isAvailable()) return preferred;
    console.log(`[Parser] ${preferred.name} unavailable — using TextFallback for ${fmt}`);
    return ParserFactory.create('text');
  }
  return getParser();
}

function extToFormat(ext: string): InputFormat {
  const map: Record<string, InputFormat> = {
    md: 'md', markdown: 'md', txt: 'txt', csv: 'csv', adoc: 'asciidoc', asciidoc: 'asciidoc',
    html: 'html', htm: 'html', pdf: 'pdf', docx: 'docx', doc: 'docx', pptx: 'pptx', ppt: 'pptx',
    xlsx: 'xlsx', xls: 'xlsx', png: 'png', jpg: 'jpg', jpeg: 'jpeg', gif: 'gif', webp: 'webp',
  };
  return map[ext] ?? 'auto';
}
