// Literature Search API — calls connector endpoints for CrossRef and arXiv
import { get, post } from "./client";

export interface LiteraturePaper {
  id: string;
  title: string;
  type: string;
  updatedAt: string;
  description: string;
  metadata: {
    doi?: string;
    arxivId?: string;
    source: string;
    journal?: string;
    year?: number;
  };
}

export interface LiteratureDocument {
  id: string;
  title: string;
  author: string;
  content: string;
  tags: string[];
  attachments: Array<{ name: string; url: string; mimeType?: string }>;
  metadata: Record<string, unknown>;
}

export interface LiteratureSearchResult {
  papers: LiteraturePaper[];
  source: string;
  total: number;
}

export const literatureApi = {
  /** List available connectors */
  async listSources(): Promise<Array<{ name: string; label: string; version: string }>> {
    const data = await get<{ connectors: Array<{ name: string; label: string; version: string }> }>("/connectors");
    return data.connectors.filter((c) => c.name === "arxiv" || c.name === "crossref");
  },

  /** Search papers from a specific connector */
  async search(
    source: string,
    keyword: string,
  ): Promise<LiteratureSearchResult> {
    const params = new URLSearchParams({ keyword });
    const data = await get<{ connector: string; total: number; documents: LiteraturePaper[] }>(
      `/connectors/${source}/documents?${params.toString()}`,
    );
    return {
      papers: data.documents || [],
      source: data.connector,
      total: data.total,
    };
  },

  /** Get full detail for a paper */
  async detail(source: string, id: string): Promise<LiteratureDocument> {
    const data = await get<{ connector: string; document: LiteratureDocument }>(
      `/connectors/${source}/documents/${encodeURIComponent(id)}`,
    );
    return data.document;
  },

  /** Sync (import) a single paper by ID */
  async importPaper(source: string, id: string): Promise<{ entryId?: number; error?: string }> {
    const body: Record<string, unknown> = {};
    // Use idList for arXiv, dois for CrossRef
    if (source === "arxiv") {
      (body as any).idList = [id];
    } else {
      (body as any).dois = [id];
    }
    body.dryRun = false;

    const data = await post<{
      total: number;
      succeeded: number;
      failed: number;
      results: Array<{ id: string; title: string; entryId?: number; error?: string }>;
    }>(`/connectors/${source}/sync`, body);

    return data.results?.[0] || { error: "import failed" };
  },

  /** Batch import multiple papers */
  async importPapers(
    source: string,
    ids: string[],
  ): Promise<{ total: number; succeeded: number; failed: number }> {
    const body: Record<string, unknown> = {};
    if (source === "arxiv") {
      (body as any).idList = ids;
    } else {
      (body as any).dois = ids;
    }
    body.dryRun = false;

    const data = await post<{ total: number; succeeded: number; failed: number }>(
      `/connectors/${source}/sync`,
      body,
    );
    return data;
  },
};
