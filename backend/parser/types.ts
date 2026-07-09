// Provider-agnostic document parser abstraction
// Add new parsers by implementing this interface — no other code changes needed

export type InputFormat = 'pdf' | 'docx' | 'md' | 'txt' | 'png' | 'jpg' | 'jpeg' | 'gif' | 'webp' | 'auto';

export interface ParseOptions {
  /** Override auto-detected format */
  format?: InputFormat;
  /** Extract structured properties from markdown tables */
  extractProperties?: boolean;
  /** Max file size in bytes (default 50MB) */
  maxFileSize?: number;
  /** Timeout in ms (default 120s) */
  timeout?: number;
}

export interface ParseResult {
  markdown: string;
  sourceFormat: InputFormat;
  metadata: ParseMetadata;
  properties?: import('../types.js').ParsedProperty[];
  warnings: string[];
  /** Per-stage timing */
  timing: {
    detectMs: number;
    parseMs: number;
    totalMs: number;
  };
}

export interface ParseMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  pageCount?: number;
  wordCount?: number;
  parsedAt: string;
}

export interface ParserCapability {
  format: InputFormat;
  extensions: string[];
  description: string;
  /** Whether the parser dependency is installed and ready */
  available: boolean;
}

/**
 * Unified Document Parser interface.
 *
 * Adding a new parser (Docling, Unstructured, MinerU) requires:
 * 1. Implement this interface
 * 2. Register in parser/index.ts
 * — no changes to ImportService or routes needed.
 */
export interface DocumentParser {
  readonly name: string;

  /** List supported formats and whether dependencies are available */
  getCapabilities(): ParserCapability[];

  /** Parse a file from disk */
  parseFile(filePath: string, options?: ParseOptions): Promise<ParseResult>;

  /** Parse from a string (for API/content uploads) */
  parseString(content: string, fileName?: string, options?: ParseOptions): Promise<ParseResult>;

  /** Parse from a Buffer (for multipart uploads) */
  parseBuffer(buffer: Buffer, fileName: string, options?: ParseOptions): Promise<ParseResult>;

  /** Detect format from file extension */
  detectFormat(fileName: string): InputFormat;
}

/** Error thrown by parsers with actionable diagnostics */
export class ParserError extends Error {
  constructor(
    message: string,
    public readonly code: string,        // e.g. 'DEPENDENCY_MISSING', 'UNSUPPORTED_FORMAT', 'TIMEOUT'
    public readonly fileName?: string,
    public readonly format?: InputFormat,
    public readonly suggestion?: string, // actionable fix
  ) {
    super(message);
    this.name = 'ParserError';
  }
}
