// arXiv API types
export interface ArxivPaper {
  id: string;         // arXiv ID, e.g. "1706.03762v7"
  title: string;
  authors: string[];  // Author full names
  summary: string;    // Abstract
  published: string;  // ISO date
  updated: string;    // ISO date
  categories: string[];  // e.g. ["cs.CL", "cs.LG"]
  primaryCategory: string;
  pdfUrl: string;
  absUrl: string;
  doi?: string;       // Extracted from summary if available
  comment?: string;   // e.g. "15 pages, 5 figures"
  journalRef?: string;
}
