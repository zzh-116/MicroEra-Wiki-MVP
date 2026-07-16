import { EntryType, WikiEntry } from "../types/wiki";
import { post } from "./client";
import { mvpEntryToWikiEntry, reverseEntryType } from "../utils/adapter";

export interface SearchResult {
  id: string;
  title: string;
  summary: string;
  type: EntryType;
  tags: string[];
  updatedAt: string;
  owner: string;
  visibility: "public" | "internal";
  matchReason: string;
  referenceSource?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  source: string;
}

export const searchApi = {
  async search(
    query: string,
    typeFilter: string = "all",
    searchMode: "keyword" | "nlp" | "title" = "keyword",
    page = 1,
    pageSize = 10,
  ): Promise<SearchResponse> {
    try {
      const body: any = { query, page, pageSize, searchMode };
      if (typeFilter !== "all") {
        body.type = reverseEntryType(typeFilter);
      }

      const data = await post<any>("/search", body);
      const results: SearchResult[] = (data.results || []).map((r: any) => {
        const entry = mvpEntryToWikiEntry(r);
        return {
          id: entry.id as string,
          title: entry.title as string,
          summary: entry.summary as string,
          type: entry.entryType as EntryType,
          tags: (entry.tags as string[]) || [],
          updatedAt: entry.latestUpdatedAt as string,
          owner: (entry.owner as string) || "",
          visibility: entry.visibility as "public" | "internal",
          matchReason: "关键词匹配",
          referenceSource: "keyword",
        };
      });
      return {
        results,
        page: data.page || 1,
        pageSize: data.pageSize || 10,
        total: data.total || results.length,
        totalPages: data.totalPages || 1,
        source: data.source || "database",
      };
    } catch {
      return { results: [], page: 1, pageSize: 10, total: 0, totalPages: 0, source: "error" };
    }
  },
};
