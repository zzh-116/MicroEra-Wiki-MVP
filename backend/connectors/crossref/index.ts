// CrossRef Connector — academic literature via DOI / title search.
// Free API, no authentication required. Covers 150M+ works.
import { Connector, Document, DocumentSummary, SyncResult } from "../types.js";
import { ConnectorRegistry } from "../registry.js";
import { fetchByDOI, searchByTitle } from "./client.js";
import { toMarkdown } from "./markdown.js";

const DOI_RE = /\b10\.\d{4,}\/[-._;()/:A-Z0-9]+\b/i;

function looksLikeDOI(text: string): boolean {
  return DOI_RE.test(text.trim());
}

class CrossRefConnector implements Connector {
  readonly name = "crossref";
  readonly label = "CrossRef 学术文献";
  readonly version = "1.0";

  async connect(): Promise<void> {
    // CrossRef API is open — no auth needed
  }

  async list(params?: {
    projectId?: string;
    keyword?: string;
    type?: string;
    status?: string;
    author?: string;
    since?: string;
  }): Promise<DocumentSummary[]> {
    const keyword = params?.keyword?.trim();

    // 1. Keyword looks like a DOI → single-paper lookup
    if (keyword && looksLikeDOI(keyword)) {
      const match = keyword.match(DOI_RE);
      if (match) {
        const work = await fetchByDOI(match[0]);
        if (work) {
          return [{
            id: work.DOI,
            title: work.title,
            type: "academic_paper",
            updatedAt: String(work.publishedYear || ""),
            description: `${work.author} — ${work.journal}`,
            metadata: { doi: work.DOI, source: "crossref" },
          }];
        }
      }
      return [];
    }

    // 2. Keyword search
    if (keyword) {
      const works = await searchByTitle(keyword);
      return works.map((w) => ({
        id: w.DOI || `crossref:${encodeURIComponent(w.title)}`,
        title: w.title,
        type: "academic_paper",
        updatedAt: String(w.publishedYear || ""),
        description: `${w.author} — ${w.journal}`,
        metadata: { doi: w.DOI, source: "crossref" },
      }));
    }

    // 3. No keyword — nothing to list (CrossRef is a search engine)
    return [];
  }

  async detail(id: string): Promise<Document> {
    const doi = id.startsWith("crossref:") ? id.slice("crossref:".length) : id;

    const work = await fetchByDOI(doi);
    if (!work) {
      throw new Error(`CrossRef: paper not found for DOI: ${doi}`);
    }

    const markdown = toMarkdown(work);

    return {
      id: work.DOI || doi,
      title: work.title,
      type: "academic_paper",
      updatedAt: String(work.publishedYear || ""),
      content: markdown,
      attachments: [],
      source: "crossref",
      tags: ["academic", "paper"],
      author: work.author,
      metadata: {
        doi: work.DOI,
        journal: work.journal,
        year: work.publishedYear,
        source: "crossref",
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

    // For CrossRef, sync requires a keyword or DOI list.
    // Use projectId as a comma-separated DOI list, or keyword from params.
    // @ts-ignore — extended params (keyword, dois) passed via route body
    const keyword: string | undefined = params?.keyword;
    // @ts-ignore
    const dois: string[] | undefined = params?.dois;

    let summaries: DocumentSummary[] = [];

    if (dois && dois.length > 0) {
      // Batch DOI import
      summaries = [];
      for (const doi of dois) {
        const work = await fetchByDOI(doi.trim());
        if (work) {
          summaries.push({
            id: work.DOI,
            title: work.title,
            type: "academic_paper",
            updatedAt: String(work.publishedYear || ""),
            description: `${work.author} — ${work.journal}`,
            metadata: { doi: work.DOI, source: "crossref" },
          });
        } else {
          errors.push(`DOI not found: ${doi}`);
        }
      }
    } else if (keyword || params?.projectId) {
      // Search by keyword (projectId doubles as search query for CrossRef)
      const query = keyword || params?.projectId || "";
      summaries = await this.list({ keyword: query });
      if (summaries.length === 0) {
        errors.push(`No results for query: ${query}`);
      }
    } else {
      errors.push("CrossRef sync requires 'keyword' or 'dois' in request body");
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

ConnectorRegistry.register("crossref", () => new CrossRefConnector());
