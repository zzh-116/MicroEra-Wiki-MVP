// DocumentParser — abstract interface for document parsing
// All parser implementations (Docling, MinerU, LlamaParse, etc.) must implement this.
// Business logic must never depend on a concrete parser — always inject via factory.
import type { ParseResult, ParseOptions, ParserCapability, InputFormat } from './models.js';

export interface DocumentParser {
  /** Human-readable parser name for logging */
  readonly name: string;

  /** Version string of the underlying parser engine */
  readonly version: string;

  /** List supported formats and whether dependencies are available */
  getCapabilities(): ParserCapability[];

  /** Parse a file from disk. Primary entry point for batch/file imports. */
  parseFile(filePath: string, options?: ParseOptions): Promise<ParseResult>;

  /** Parse from a string (API/content uploads). Only works for text-based formats. */
  parseString(content: string, fileName?: string, options?: ParseOptions): Promise<ParseResult>;

  /** Parse from a Buffer (multipart uploads). Writes buffer to temp file, then delegates to parseFile. */
  parseBuffer(buffer: Buffer, fileName: string, options?: ParseOptions): Promise<ParseResult>;

  /** Detect format from file extension */
  detectFormat(fileName: string): InputFormat;

  /** Check if the parser engine is installed and functional */
  isAvailable(): Promise<boolean>;
}
