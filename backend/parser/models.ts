// Unified parser models — shared across all parser implementations
// No parser-specific types leak beyond this module

/** Supported input formats — extended for Docling */
export type InputFormat =
  | 'pdf' | 'docx' | 'pptx' | 'xlsx'
  | 'html' | 'md' | 'asciidoc' | 'csv' | 'txt'
  | 'png' | 'jpg' | 'jpeg' | 'gif' | 'webp'
  | 'auto';

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

/** Structured metadata extracted from a parsed document */
export interface ParseMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  pageCount?: number;
  wordCount?: number;
  /** Docling-specific: section/title info */
  title?: string;
  headings?: string[];
  tablesCount?: number;
  imagesCount?: number;
  parsedAt: string;
}

/** Unified result from any parser implementation */
export interface ParseResult {
  /** Clean Markdown for downstream RAG ingestion */
  markdown: string;
  /** Detected or specified source format */
  sourceFormat: InputFormat;
  /** Document metadata */
  metadata: ParseMetadata;
  /** Structured properties extracted from tables (materials data) */
  properties?: import('../types.js').ParsedProperty[];
  /** Non-fatal warnings encountered during parsing */
  warnings: string[];
  /** Per-stage timing for diagnostics */
  timing: {
    detectMs: number;
    parseMs: number;
    totalMs: number;
  };
}

/** Advertised capability of a parser implementation */
export interface ParserCapability {
  format: InputFormat;
  extensions: string[];
  description: string;
  /** Whether the parser dependency is installed and ready */
  available: boolean;
}

/** Error thrown by parsers with actionable diagnostics */
export class ParserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly fileName?: string,
    public readonly format?: InputFormat,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = 'ParserError';
  }
}
