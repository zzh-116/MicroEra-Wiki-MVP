// Parser module entry point — re-exports everything for consumers
//
// Usage:
//   import { getParser, ParserFactory } from '../parser/index.js';
//   const parser = getParser();                    // singleton, "docling" by default
//   const parser2 = ParserFactory.create('docling'); // new instance
//
// To add a custom parser at startup:
//   import { ParserFactory } from '../parser/index.js';
//   import { MyParser } from './my-parser.js';
//   ParserFactory.register('my-parser', () => new MyParser());
export { getParser, resetParser, ParserFactory } from './factory.js';
export { ParserError } from './models.js';
export type { DocumentParser } from './base.js';
export type {
  InputFormat,
  ParseOptions,
  ParseResult,
  ParseMetadata,
  ParserCapability,
} from './models.js';
