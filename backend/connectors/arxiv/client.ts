// arXiv API Client — free, no authentication needed.
// Rate limit: be polite, ~1 request per second.
import type { ArxivPaper } from "./types.js";

const BASE = "https://export.arxiv.org/api/query";

/** Build arXiv API query URL */
function buildQuery(params: {
  searchQuery?: string;
  idList?: string[];
  start?: number;
  maxResults?: number;
  sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate";
  sortOrder?: "ascending" | "descending";
}): string {
  const parts: string[] = [];

  if (params.idList && params.idList.length > 0) {
    parts.push(`id_list=${params.idList.map(encodeURIComponent).join(",")}`);
  } else if (params.searchQuery) {
    parts.push(`search_query=${encodeURIComponent(params.searchQuery)}`);
  } else {
    parts.push(`search_query=all:electron`);
  }

  parts.push(`start=${params.start || 0}`);
  parts.push(`max_results=${Math.min(params.maxResults || 10, 50)}`);

  if (params.sortBy) parts.push(`sortBy=${params.sortBy}`);
  if (params.sortOrder) parts.push(`sortOrder=${params.sortOrder}`);

  return `${BASE}?${parts.join("&")}`;
}

/** Search arXiv by query string */
export async function searchArxiv(
  query: string,
  maxResults = 20,
  sortBy: "relevance" | "lastUpdatedDate" | "submittedDate" = "relevance",
): Promise<ArxivPaper[]> {
  const url = buildQuery({ searchQuery: query, maxResults, sortBy });
  return fetchAndParse(url);
}

/** Fetch papers by arXiv ID list */
export async function fetchByIds(ids: string[]): Promise<ArxivPaper[]> {
  const url = buildQuery({ idList: ids, maxResults: ids.length });
  return fetchAndParse(url);
}

/** Fetch a single paper by arXiv ID */
export async function fetchById(id: string): Promise<ArxivPaper | null> {
  const papers = await fetchByIds([id]);
  return papers.length > 0 ? papers[0] : null;
}

// ---- XML Parsing ----

/** Fetch and parse Atom XML response from arXiv */
async function fetchAndParse(url: string): Promise<ArxivPaper[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "MicroEraWiki/1.0 (mailto:admin@microera.com)" },
  });

  if (!res.ok) {
    throw new Error(`arXiv API returned HTTP ${res.status}`);
  }

  const xml = await res.text();
  return parseAtomFeed(xml);
}

/** Parse arXiv Atom XML feed into ArxivPaper[] using regex */
function parseAtomFeed(xml: string): ArxivPaper[] {
  const papers: ArxivPaper[] = [];

  // Split into individual <entry> blocks
  const entryBlocks = xml.split(/<entry>/).slice(1);

  for (const block of entryBlocks) {
    const entry = block.split(/<\/entry>/)[0];
    if (!entry) continue;

    try {
      papers.push(parseEntry(entry));
    } catch {
      // Skip malformed entries
    }
  }

  return papers;
}

/** Extract text content of an XML tag */
function tagContent(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? decodeXmlEntities(m[1].trim()) : "";
}

/** Extract all text contents of repeated XML tags */
function tagContents(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(decodeXmlEntities(m[1].trim()));
  }
  return results;
}

/** Extract href attribute from <link> tag by rel */
function linkHref(xml: string, rel: string): string {
  const re = new RegExp(
    `<link[^>]*href="([^"]*)"[^>]*rel="${rel}"[^>]*>|<link[^>]*rel="${rel}"[^>]*href="([^"]*)"[^>]*>`,
    "i",
  );
  const m = xml.match(re);
  return m ? (m[1] || m[2] || "") : "";
}

/** Extract title attribute value from <arxiv:primary_category> or <category> */
function categoryTerm(xml: string, primary: boolean): string {
  const tag = primary ? "arxiv:primary_category" : "category";
  const re = new RegExp(`<${tag}[^>]*term="([^"]*)"[^>]*>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

/** Parse a single Atom <entry> block */
function parseEntry(entry: string): ArxivPaper {
  // Extract arXiv ID from the <id> tag (full URL)
  const idUrl = tagContent(entry, "id");
  const idMatch = idUrl.match(/(?:arxiv\.org\/abs\/|arxiv\.org\/pdf\/)([\w.\/-]+)/i);
  const arxivId = idMatch ? idMatch[1] : idUrl;

  // Title: strip extra whitespace/newlines
  const title = tagContent(entry, "title")
    .replace(/\s+/g, " ")
    .trim();

  // Authors
  const authors = tagContents(entry, "name");

  // Summary (abstract)
  const summary = tagContent(entry, "summary")
    .replace(/\s+/g, " ")
    .trim();

  // Dates
  const published = tagContent(entry, "published");
  const updated = tagContent(entry, "updated");

  // Categories (all <category> tags)
  const allCats: string[] = [];
  const catRe = /<category[^>]*term="([^"]*)"[^>]*>/gi;
  let catM: RegExpExecArray | null;
  while ((catM = catRe.exec(entry)) !== null) {
    allCats.push(catM[1]);
  }

  const primaryCategory = categoryTerm(entry, true) || allCats[0] || "";

  // Links
  const absUrl = linkHref(entry, "alternate") || `https://arxiv.org/abs/${arxivId}`;
  const pdfUrl = linkHref(entry, "related") || `https://arxiv.org/pdf/${arxivId}`;

  // Optional metadata
  const comment = tagContent(entry, "arxiv:comment") || tagContent(entry, "comment");
  const journalRef = tagContent(entry, "arxiv:journal_ref") || tagContent(entry, "journal_ref");

  // Try to extract DOI from summary or journal_ref
  let doi: string | undefined;
  const doiMatch = (summary + " " + journalRef).match(/\b(10\.\d{4,}\/[-._;()/:A-Z0-9]+)\b/i);
  if (doiMatch) doi = doiMatch[1];

  return {
    id: arxivId,
    title,
    authors,
    summary,
    published,
    updated,
    categories: allCats,
    primaryCategory,
    pdfUrl,
    absUrl,
    doi,
    comment: comment || undefined,
    journalRef: journalRef || undefined,
  };
}

/** Decode common XML/HTML entities */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}
