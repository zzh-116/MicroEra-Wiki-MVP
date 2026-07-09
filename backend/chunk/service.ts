// Chunk Service — splits documents into embeddable chunks using multiple strategies
// Supports: fixed-size, paragraph, sentence, markdown-aware splitting with configurable overlap

export interface ChunkConfig {
  strategy: 'fixed' | 'paragraph' | 'sentence' | 'markdown';
  chunkSize: number;   // target characters per chunk (default 512)
  overlap: number;     // overlap characters between chunks (default 64)
  minChunkSize: number; // discard chunks shorter than this (default 50)
}

export interface ChunkResult {
  id: string;           // unique chunk id: `${docId}_chunk_${index}`
  index: number;        // position in document
  text: string;         // chunk text content
  startChar: number;    // character offset in original document
  endChar: number;      // end character offset
  metadata: {
    strategy: string;
    heading?: string;   // nearest markdown heading (markdown strategy)
  };
}

const DEFAULT_CONFIG: ChunkConfig = {
  strategy: 'markdown',
  chunkSize: 1024,
  overlap: 128,
  minChunkSize: 50,
};

export class ChunkService {
  /**
   * Split text into chunks using the configured strategy.
   */
  chunk(text: string, docId: string, config: Partial<ChunkConfig> = {}): ChunkResult[] {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    switch (cfg.strategy) {
      case 'fixed':
        return this.fixedChunk(text, docId, cfg);
      case 'paragraph':
        return this.paragraphChunk(text, docId, cfg);
      case 'sentence':
        return this.sentenceChunk(text, docId, cfg);
      case 'markdown':
        return this.markdownChunk(text, docId, cfg);
      default:
        return this.markdownChunk(text, docId, cfg);
    }
  }

  /**
   * Fixed-size chunking — splits at exactly chunkSize characters,
   * trying to break at whitespace near the boundary.
   */
  private fixedChunk(text: string, docId: string, cfg: ChunkConfig): ChunkResult[] {
    const chunks: ChunkResult[] = [];
    let offset = 0;
    let index = 0;

    while (offset < text.length) {
      let end = Math.min(offset + cfg.chunkSize, text.length);

      // Try to break at whitespace near the boundary
      if (end < text.length) {
        const searchStart = Math.max(offset + cfg.chunkSize - 40, offset);
        const slice = text.slice(searchStart, end + 40);
        const breakPt = slice.search(/[\s。，,\.!?;；\n]/);
        if (breakPt >= 0 && breakPt < cfg.chunkSize - searchStart + offset + 40) {
          end = searchStart + breakPt + 1;
        }
      }

      const chunkText = text.slice(offset, end).trim();
      if (chunkText.length >= cfg.minChunkSize) {
        chunks.push({
          id: `${docId}_chunk_${index}`,
          index,
          text: chunkText,
          startChar: offset,
          endChar: end,
          metadata: { strategy: 'fixed' },
        });
        index++;
      }

      offset = end - cfg.overlap;
      if (offset <= 0 || offset >= text.length) break;
    }

    return chunks;
  }

  /**
   * Paragraph-based chunking — splits on double-newline boundaries,
   * merging short paragraphs with neighbors to meet chunkSize.
   */
  private paragraphChunk(text: string, docId: string, cfg: ChunkConfig): ChunkResult[] {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const chunks: ChunkResult[] = [];
    let buffer = '';
    let startChar = 0;
    let index = 0;

    for (const para of paragraphs) {
      const trimmed = para.trim();

      if (buffer.length + trimmed.length > cfg.chunkSize && buffer.length >= cfg.minChunkSize) {
        chunks.push({
          id: `${docId}_chunk_${index}`,
          index,
          text: buffer.trim(),
          startChar,
          endChar: startChar + buffer.length,
          metadata: { strategy: 'paragraph' },
        });
        index++;
        // Apply overlap: keep last portion of buffer
        const overlapText = buffer.slice(-cfg.overlap);
        buffer = overlapText + '\n\n' + trimmed;
        startChar = startChar + buffer.length - trimmed.length - overlapText.length;
      } else {
        buffer += (buffer ? '\n\n' : '') + trimmed;
      }
    }

    // Flush remaining
    if (buffer.trim().length >= cfg.minChunkSize) {
      chunks.push({
        id: `${docId}_chunk_${index}`,
        index,
        text: buffer.trim(),
        startChar,
        endChar: startChar + buffer.length,
        metadata: { strategy: 'paragraph' },
      });
    }

    return chunks;
  }

  /**
   * Sentence-based chunking — splits on sentence boundaries
   * (。.!?！？\n), merging sentences to fill chunks.
   */
  private sentenceChunk(text: string, docId: string, cfg: ChunkConfig): ChunkResult[] {
    // Split on sentence boundaries while keeping delimiters
    const sentences = text.split(/(?<=[。.!?！？\n])\s*/).filter((s) => s.trim().length > 0);
    const chunks: ChunkResult[] = [];
    let buffer = '';
    let startChar = 0;
    let index = 0;

    for (const sent of sentences) {
      const trimmed = sent.trim();

      if (buffer.length + trimmed.length > cfg.chunkSize && buffer.length >= cfg.minChunkSize) {
        chunks.push({
          id: `${docId}_chunk_${index}`,
          index,
          text: buffer.trim(),
          startChar,
          endChar: startChar + buffer.length,
          metadata: { strategy: 'sentence' },
        });
        index++;
        const overlapText = buffer.slice(-cfg.overlap);
        buffer = overlapText + trimmed;
        startChar = startChar + buffer.length - trimmed.length - overlapText.length;
      } else {
        buffer += (buffer ? ' ' : '') + trimmed;
      }
    }

    if (buffer.trim().length >= cfg.minChunkSize) {
      chunks.push({
        id: `${docId}_chunk_${index}`,
        index,
        text: buffer.trim(),
        startChar,
        endChar: startChar + buffer.length,
        metadata: { strategy: 'sentence' },
      });
    }

    return chunks;
  }

  /**
   * Markdown-aware chunking — splits on headings (##, ###),
   * with sub-heading grouping. Keeps heading context in metadata.
   */
  private markdownChunk(text: string, docId: string, cfg: ChunkConfig): ChunkResult[] {
    // Split on markdown headings while keeping the heading in the chunk
    const sections = text.split(/(?=^#{1,4}\s)/m).filter((s) => s.trim().length > 0);
    const chunks: ChunkResult[] = [];
    let index = 0;
    let charOffset = 0;

    for (const section of sections) {
      // Extract heading if present
      const headingMatch = section.match(/^(#{1,4})\s+(.+?)(?:\r?\n|$)/);
      const heading = headingMatch ? headingMatch[2].trim() : undefined;

      // If section is small enough, keep as one chunk
      if (section.length <= cfg.chunkSize * 1.5) {
        const trimmed = section.trim();
        if (trimmed.length >= cfg.minChunkSize) {
          chunks.push({
            id: `${docId}_chunk_${index}`,
            index,
            text: trimmed,
            startChar: charOffset,
            endChar: charOffset + section.length,
            metadata: { strategy: 'markdown', heading },
          });
          index++;
        }
        charOffset += section.length;
        continue;
      }

      // Large section — sub-split on paragraphs or double-newlines
      const body = headingMatch ? section.slice(headingMatch[0].length) : section;
      const bodyParagraphs = body.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

      let buffer = headingMatch ? headingMatch[0] : '';
      let sectionStart = charOffset;

      for (const para of bodyParagraphs) {
        const trimmed = para.trim();
        if (buffer.length + trimmed.length > cfg.chunkSize && buffer.length >= cfg.minChunkSize) {
          chunks.push({
            id: `${docId}_chunk_${index}`,
            index,
            text: buffer.trim(),
            startChar: sectionStart,
            endChar: sectionStart + buffer.length,
            metadata: { strategy: 'markdown', heading },
          });
          index++;
          // Overlap: carry heading + last bit
          const overlapText = buffer.slice(-cfg.overlap);
          buffer = (headingMatch ? headingMatch[0] : '') + overlapText + '\n\n' + trimmed;
          sectionStart = sectionStart + buffer.length - trimmed.length - overlapText.length;
        } else {
          buffer += (buffer ? '\n\n' : '') + trimmed;
        }
      }

      // Flush remaining buffer for this section
      if (buffer.trim().length >= cfg.minChunkSize) {
        chunks.push({
          id: `${docId}_chunk_${index}`,
          index,
          text: buffer.trim(),
          startChar: sectionStart,
          endChar: sectionStart + buffer.length,
          metadata: { strategy: 'markdown', heading },
        });
        index++;
      }

      charOffset += section.length;
    }

    return chunks;
  }

  /**
   * Estimate chunk count without actually chunking (for progress reporting).
   */
  estimateCount(text: string, cfg: Partial<ChunkConfig> = {}): number {
    const c = { ...DEFAULT_CONFIG, ...cfg };
    return Math.ceil(text.length / (c.chunkSize - c.overlap));
  }
}

export const chunkService = new ChunkService();
