// Parser Factory — pluggable registry for DocumentParser implementations
//
// To add a new parser (MinerU, LlamaParse, Unstructured, etc.):
//   1. Implement DocumentParser from './base.js'
//   2. Register here: ParserFactory.register('my-parser', () => new MyParser());
//   3. Set env: PARSER_PROVIDER=my-parser
//
// No changes needed in ImportService, routes, or any downstream consumer.
import type { DocumentParser } from './base.js';
import { DoclingParser } from './docling.js';

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
