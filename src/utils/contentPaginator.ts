// contentPaginator — splits ContentBlock[] into pages with estimated heights.
// Smart break rules: never split tables, code blocks, or images across pages.
// Prefer breaks at heading boundaries for natural reading flow.

import type { ContentBlock } from './contentParser';
import { parseContent } from './contentParser';

// ---- Types ----

export interface Page {
  index: number;
  blocks: ContentBlock[];
  /** First heading on this page (for TOC / navigation) */
  heading?: string;
  /** Estimated height in px */
  estimatedHeight: number;
}

export interface PaginationResult {
  pages: Page[];
  totalPages: number;
}

// ---- Constants ----

/** Target page height in pixels */
const TARGET_PAGE_HEIGHT = 900;
/** Maximum page height before forcing a break */
const MAX_PAGE_HEIGHT = 1200;
/** Min page height (don't create pages with just a few lines) */
const MIN_PAGE_HEIGHT = 100;

// ---- Height estimates per block type ----

function estimateBlockHeight(block: ContentBlock): number {
  switch (block.type) {
    case 'heading': {
      const base = block.level === 1 ? 60 : block.level === 2 ? 40 : 30;
      return base + Math.ceil(block.text.length / 60) * 24;
    }
    case 'paragraph':
      return 20 + Math.ceil(block.text.length / 80) * 24;
    case 'list':
      return block.items.reduce((sum, item) => sum + 28 + Math.ceil(item.length / 75) * 24, 10);
    case 'code':
      return 40 + block.code.split('\n').length * 20;
    case 'image':
      return 250;
    case 'table':
      return 44 + (block.rows.length + 1) * 32;
    case 'blockquote':
      return 20 + Math.ceil(block.text.length / 75) * 24;
    case 'divider':
      return 20;
    case 'html':
      return 100;
    default:
      return 40;
  }
}

/** Blocks that must NOT be split across pages */
function isAtomic(block: ContentBlock): boolean {
  return block.type === 'code' || block.type === 'table' || block.type === 'image';
}

/** Blocks that make good page-break points */
function isBreakPoint(block: ContentBlock): boolean {
  return block.type === 'heading';
}

// ---- Main pagination logic ----

/**
 * Split ContentBlock[] into pages.
 * Uses estimated heights with smart break rules.
 * Caches result — call once per document.
 */
export function paginateContent(rawContent: string): PaginationResult {
  const blocks = parseContent(rawContent);
  if (blocks.length === 0) return { pages: [], totalPages: 0 };

  const pages: Page[] = [];
  let currentBlocks: ContentBlock[] = [];
  let currentHeight = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const blockHeight = estimateBlockHeight(block);

    // If this block alone exceeds max page height, give it its own page
    if (blockHeight > MAX_PAGE_HEIGHT && isAtomic(block)) {
      // Flush current page
      if (currentBlocks.length > 0) {
        pages.push(buildPage(pages.length, currentBlocks));
        currentBlocks = [];
        currentHeight = 0;
      }
      // Give this large block its own page
      pages.push(buildPage(pages.length, [block]));
      continue;
    }

    // Check if adding this block would exceed target
    if (currentHeight + blockHeight > TARGET_PAGE_HEIGHT && currentBlocks.length > 0) {
      // Smart break: if current block is a heading, break BEFORE it
      if (isBreakPoint(block) && currentHeight > MIN_PAGE_HEIGHT) {
        pages.push(buildPage(pages.length, currentBlocks));
        currentBlocks = [block];
        currentHeight = blockHeight;
        continue;
      }

      // If current block is atomic, try to fit it by making the page a bit bigger
      if (isAtomic(block) && currentHeight + blockHeight <= MAX_PAGE_HEIGHT) {
        currentBlocks.push(block);
        currentHeight += blockHeight;
        // Force page break after this atomic block
        pages.push(buildPage(pages.length, currentBlocks));
        currentBlocks = [];
        currentHeight = 0;
        continue;
      }

      // Normal overflow: flush current page, start new one
      pages.push(buildPage(pages.length, currentBlocks));
      currentBlocks = [block];
      currentHeight = blockHeight;
    } else {
      currentBlocks.push(block);
      currentHeight += blockHeight;
    }
  }

  // Flush remaining
  if (currentBlocks.length > 0) {
    pages.push(buildPage(pages.length, currentBlocks));
  }

  // If no pages or only one short page, don't paginate
  if (pages.length <= 1 && currentHeight < TARGET_PAGE_HEIGHT * 1.2) {
    return { pages, totalPages: pages.length };
  }

  return { pages, totalPages: pages.length };
}

function buildPage(index: number, blocks: ContentBlock[]): Page {
  const heading = blocks.find((b) => b.type === 'heading')?.text;
  return {
    index,
    blocks,
    heading,
    estimatedHeight: blocks.reduce((s, b) => s + estimateBlockHeight(b), 0),
  };
}

/**
 * Find which page number contains a given heading text.
 * Returns 1-based page number, or 1 if not found.
 */
export function findPageByHeading(pages: Page[], headingText: string): number {
  const idx = pages.findIndex(
    (p) => p.heading && p.heading.toLowerCase().includes(headingText.toLowerCase()),
  );
  return idx >= 0 ? idx + 1 : 1;
}
