// CrossRef API Client - no authentication needed
import type { CrossRefWork } from './types.js';

const BASE = 'https://api.crossref.org';

export async function fetchByDOI(doi: string): Promise<CrossRefWork | null> {
  try {
    const res = await fetch(${BASE}/works/, {
      headers: { 'User-Agent': 'MicroEraWiki/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return transformWork(data.message, doi);
  } catch { return null; }
}

export async function searchByTitle(title: string): Promise<CrossRefWork[]> {
  try {
    const res = await fetch(${BASE}/works?query=&rows=5, {
      headers: { 'User-Agent': 'MicroEraWiki/1.0' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.message?.items || []).map((item: any) => transformWork(item, ''));
  } catch { return []; }
}

function transformWork(msg: any, doi: string): CrossRefWork {
  return {
    DOI: doi || msg.DOI || '',
    title: (msg.title || [''])[0],
    author: (msg.author || []).map((a: any) => ${a.given || ''} .trim()).join('; '),
    publishedYear: (msg['published-print']?.['date-parts']?.[0]?.[0]) || (msg['issued']?.['date-parts']?.[0]?.[0]) || 0,
    journal: (msg['container-title'] || [''])[0],
    abstract: (msg.abstract || '').replace(/<[^>]*>/g, ''),
    url: msg.URL || https://doi.org/,
  };
}
