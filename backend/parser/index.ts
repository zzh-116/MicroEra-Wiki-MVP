// Parser factory — returns the active DocumentParser
// Swap implementations here without changing import service or routes
import type { DocumentParser } from './types.js';
import { markitdownParser } from './markitdown.parser.js';

let _parser: DocumentParser | null = null;

export function getParser(): DocumentParser {
  if (_parser) return _parser;
  _parser = markitdownParser;
  console.log(`[Parser] Provider: ${_parser.name}`);
  return _parser;
}

export function resetParser(): void { _parser = null; }

export type { DocumentParser, ParseOptions, ParseResult, InputFormat } from './types.js';
export { ParserError } from './types.js';
