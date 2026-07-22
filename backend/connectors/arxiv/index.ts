// arXiv Connector — academic preprints from arxiv.org.
// Free API, no authentication required. Covers physics, math, CS, biology, etc.
import { Connector, Document, DocumentSummary, SyncResult } from "../types.js";
import { ConnectorRegistry } from "../registry.js";
import { searchArxiv, fetchById, fetchByIds } from "./client.js";
import { toMarkdown } from "./markdown.js";

/** Check if a string looks like an arXiv ID */
function looksLikeArxivId(text: string): boolean {
  return /^\d{4}\.\d{4,}(v\d+)?$/.test(text.trim()) ||
    /^[a-z-]+\/\d{7}(v\d+)?$/i.test(text.trim());
}

export class ArxivConnector implements Connector {
  readonly name = "arxiv";
  readonly label = "arXiv 预印本";
  readonly version = "1.0";

  async connect(): Promise<void> {
    // arXiv API is open — no authentication needed
  }

  async list(params?: {
    projectId?: string;
    keyword?: string;
    type?: string;
    status?: string;
    author?: string;
    since?: string;
    dois?: string[]; // Extended param for batch import
  }): Promise<DocumentSummary[]> {
    const keyword = params?.keyword?.trim();

    // 1. Keyword looks like an arXiv ID → single-paper lookup
    if (keyword && looksLikeArxivId(keyword)) {
      const paper = await fetchById(keyword);
      if (paper) {
        return [{
          id: paper.id,
          title: paper.title,
          type: "preprint",
          updatedAt: paper.updated || paper.published,
          description: `${paper.authors.slice(0, 3).join(", ")} — ${paper.primaryCategory}`,
          metadata: { arxivId: paper.id, source: "arxiv", doi: paper.doi },
        }];
      }
      return [];
    }

    // 2. DOI batch via extended param
    // arXiv API supports id_list — if dois contains arXiv IDs, batch them
    // @ts-ignore
    const idList: string[] | undefined = params?.dois || params?.idList;
    if (idList && idList.length > 0) {
      const papers = await fetchByIds(idList);
      return papers.map((p) => ({
        id: p.id,
        title: p.title,
        type: "preprint",
        updatedAt: p.updated || p.published,
        description: `${p.authors.slice(0, 3).join(", ")} — ${p.primaryCategory}`,
        metadata: { arxivId: p.id, source: "arxiv", doi: p.doi },
      }));
    }

    // 3. Keyword search
    if (keyword) {
      const papers = await searchArxiv(keyword, 20);
      return papers.map((p) => ({
        id: p.id,
        title: p.title,
        type: "preprint",
        updatedAt: p.updated || p.published,
        description: `${p.authors.slice(0, 3).join(", ")} — ${p.primaryCategory}`,
        metadata: { arxivId: p.id, source: "arxiv", doi: p.doi },
      }));
    }

    // 4. No query — nothing to list (arXiv is a search engine)
    return [];
  }

  async detail(id: string): Promise<Document> {
    const paper = await fetchById(id);
    if (!paper) {
      throw new Error(`arXiv: paper not found for ID: ${id}`);
    }

    const markdown = toMarkdown(paper);

    return {
      id: paper.id,
      title: paper.title,
      type: "preprint",
      updatedAt: paper.updated || paper.published,
      content: markdown,
      attachments: [{ name: "PDF", url: paper.pdfUrl, mimeType: "application/pdf" }],
      source: "arxiv",
      tags: ["preprint", paper.primaryCategory.replace(".", "_").toLowerCase()],
      author: paper.authors.join(", "),
      metadata: {
        arxivId: paper.id,
        doi: paper.doi,
        categories: paper.categories,
        primaryCategory: paper.primaryCategory,
        published: paper.published,
        pdfUrl: paper.pdfUrl,
        comment: paper.comment,
        journalRef: paper.journalRef,
        source: "arxiv",
      },
    };
  }

  async sync(params?: {
    since?: string;
    projectId?: string;
    dryRun?: boolean;
  }): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // @ts-ignore — extended params from route body
    const keyword: string | undefined = params?.keyword;
    // @ts-ignore
    const idList: string[] | undefined = params?.dois || params?.idList;

    let summaries: DocumentSummary[] = [];

    if (idList && idList.length > 0) {
      summaries = await this.list({ dois: idList });
    } else if (keyword || params?.projectId) {
      const query = keyword || params?.projectId || "";
      summaries = await this.list({ keyword: query });
    } else {
      errors.push("arXiv sync requires 'keyword' or 'idList' in request body");
    }

    const total = summaries.length;

    for (const summary of summaries) {
      try {
        await this.detail(summary.id);
        created++;
      } catch (err: any) {
        errors.push(`${summary.title}: ${err.message}`);
        skipped++;
      }
    }

    return {
      connector: this.name,
      total,
      created,
      updated,
      skipped,
      errors,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    };
  }
}

// Register at module load
ConnectorRegistry.register("arxiv", () => new ArxivConnector());
