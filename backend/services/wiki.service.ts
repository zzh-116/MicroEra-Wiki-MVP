// Wiki service (P5) — the wiki.* / graph.* operation layer. A wiki page is a
// synthesized or manually-authored article scoped to a knowledge base, versioned
// like documents (every content edit appends a revision) and grounded by chunk
// citations. Links between pages form the wiki knowledge graph.
import { wikiRepository } from '../repositories/wiki.repository.js';
import { retrievalService } from './retrieval.service.js';
import { knowledgeChunkRepository } from '../repositories/knowledge-chunk.repository.js';
import { knowledgeRepository } from '../repositories/knowledge.repository.js';
import { sha256 } from '../utils/hash.js';
import { ServiceError } from './knowledge.service.js';

export interface WikiHit {
  chunk_id: string;
  document_id: number;
  title: string;
  text: string;
  heading: string | null;
  score: number;
}

function synthMarkdown(title: string, hits: WikiHit[]): { summary: string; content: string; sources: Array<{ chunkId: string; documentId: number; index: number }> } {
  const sections = hits.map((h, i) => {
    const heading = h.heading && h.heading.trim() ? h.heading.trim() : `Section ${i + 1}`;
    return `## ${heading.replace(/^#+\s*/, '')}\n\n${h.text.trim()}\n`;
  });
  const content = `# ${title}\n\n${sections.join('\n')}`;
  const summary = (hits[0]?.text ?? '').slice(0, 200);
  const sources = hits.map((h, i) => ({ chunkId: h.chunk_id, documentId: h.document_id, index: i + 1 }));
  return { summary, content, sources };
}

/** Derive a wiki summary from content (first 200 chars), matching the summary
 * convention used by synthMarkdown. `wiki_revisions` does not persist the
 * original summary (only title/content/checksum), so revert re-derives the
 * summary from the reverted content instead of restoring a stored value —
 * keeping summary consistent with the reverted content without a migration. */
function summaryOf(content: string): string {
  return (content ?? '').slice(0, 200);
}

/** Minimal line-level LCS diff → an ordered edit script (add/remove/keep). */
function diffLines(a: string, b: string): Array<{ type: 'add' | 'remove' | 'keep'; text: string }> {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: Array<{ type: 'add' | 'remove' | 'keep'; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: 'keep', text: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'remove', text: A[i] }); i++; }
    else { out.push({ type: 'add', text: B[j] }); j++; }
  }
  while (i < n) out.push({ type: 'remove', text: A[i++] });
  while (j < m) out.push({ type: 'add', text: B[j++] });
  return out;
}

export class WikiService {
  private async retrieve(input: { query: string; kb_id?: number; document_ids?: number[]; top_k: number; method: 'vector' | 'lexical' | 'hybrid' }): Promise<WikiHit[]> {
    const results = await retrievalService.filteredSearch({
      query: input.query,
      method: input.method,
      kb_id: input.kb_id,
      top_k: input.top_k,
      filters: input.document_ids?.length ? { document_ids: input.document_ids } : undefined,
    });
    return results.map((r: any) => ({
      chunk_id: r.chunk_id,
      document_id: r.document_id,
      title: r.title,
      text: r.text,
      heading: r.heading ?? null,
      score: r.score,
    }));
  }

  async generate(input: { title?: string; question?: string; kb_id?: number; document_ids?: number[]; top_k?: number; method?: 'vector' | 'lexical' | 'hybrid' }): Promise<Record<string, unknown>> {
    const title = (input.title ?? input.question ?? '').trim();
    if (!title) throw new ServiceError('validation_failed', 'title or question is required');
    const method = input.method ?? 'hybrid';
    const topK = Math.min(Math.max(input.top_k ?? 8, 1), 50);

    const hits = await this.retrieve({ query: input.question ?? title, kb_id: input.kb_id, document_ids: input.document_ids, top_k: topK, method });
    const { summary, content, sources } = synthMarkdown(title, hits);

    const wiki = await wikiRepository.createWiki({
      title,
      summary,
      content,
      kbId: input.kb_id ?? null,
      status: 'completed',
      revisionNo: 1,
    });
    await wikiRepository.createRevision({ wikiId: wiki.id, revisionNo: 1, title, content, checksum: sha256(content) });
    await wikiRepository.addSources(wiki.id, sources);

    return { wiki_id: wiki.id, title, status: wiki.status, revision_no: 1, source_count: sources.length };
  }

  async status(wikiId: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    return { wiki_id: w.id, status: w.status, revision_no: w.revision_no, updated_at: w.updated_at };
  }

  async list(input: { page?: number; page_size?: number; kb_id?: number }): Promise<{ items: unknown[]; total: number }> {
    const { items, total } = await wikiRepository.listWikis({ page: input.page, pageSize: input.page_size, kbId: input.kb_id });
    return { items, total };
  }

  async read(wikiId: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    return w;
  }

  async search(input: { q: string; page?: number; page_size?: number }): Promise<{ items: unknown[]; total: number }> {
    if (!input.q?.trim()) throw new ServiceError('validation_failed', 'q is required');
    const { items, total } = await wikiRepository.searchWikis(input.q.trim(), { page: input.page, pageSize: input.page_size });
    return { items, total };
  }

  // ── Sources / citations (W02) ─────────────────────────────────────────────
  async sources(wikiId: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    const srcs = await wikiRepository.listSources(wikiId);
    const resolved = await Promise.all(
      srcs.map(async (s) => {
        const doc = await knowledgeRepository.findDocumentById(s.document_id);
        return { index: s.index, chunk_id: s.chunk_id, document_id: s.document_id, title: doc?.title ?? '' };
      }),
    );
    return { wiki_id: wikiId, sources: resolved, total: resolved.length };
  }

  async citationRead(chunkId: string): Promise<Record<string, unknown>> {
    const chunk = await knowledgeChunkRepository.findById(chunkId);
    if (!chunk) throw new ServiceError('resource_not_found', 'citation chunk not found');
    const doc = await knowledgeRepository.findDocumentById(chunk.document_id);
    if (!doc) throw new ServiceError('resource_not_found', 'citation document not found');
    return {
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      title: doc.title,
      text: chunk.text,
      strategy: chunk.strategy,
      heading: chunk.heading,
    };
  }

  async verify(wikiId: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    const srcs = await wikiRepository.listSources(wikiId);
    const citations = await Promise.all(
      srcs.map(async (s) => {
        const chunk = await knowledgeChunkRepository.findById(s.chunk_id);
        const doc = chunk ? await knowledgeRepository.findDocumentById(chunk.document_id) : undefined;
        return { index: s.index, chunk_id: s.chunk_id, document_id: s.document_id, resolved: !!chunk && !!doc };
      }),
    );
    const resolved = citations.filter((c) => c.resolved).length;
    return { wiki_id: wikiId, citations, resolved, total: citations.length };
  }

  // ── Links / graph (W03) ───────────────────────────────────────────────────
  async links(wikiId: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    const { outgoing, incoming } = await wikiRepository.listLinks(wikiId);
    return { wiki_id: wikiId, outgoing, incoming };
  }

  async link(sourceWikiId: number, targetWikiId: number): Promise<Record<string, unknown>> {
    if (sourceWikiId === targetWikiId) throw new ServiceError('validation_failed', 'cannot link a wiki to itself');
    const [src, tgt] = await Promise.all([wikiRepository.findWikiById(sourceWikiId), wikiRepository.findWikiById(targetWikiId)]);
    if (!src || !tgt) throw new ServiceError('resource_not_found', 'wiki not found');
    const link = await wikiRepository.createLink(sourceWikiId, targetWikiId);
    return { source_wiki_id: link.source_wiki_id, target_wiki_id: link.target_wiki_id, created_at: link.created_at };
  }

  async unlink(sourceWikiId: number, targetWikiId: number): Promise<Record<string, unknown>> {
    const removed = await wikiRepository.deleteLink(sourceWikiId, targetWikiId);
    return { removed };
  }

  async graph(wikiId?: number): Promise<Record<string, unknown>> {
    const links = await wikiRepository.listAllLinks();
    let nodes = await wikiRepository.listWikis({ page: 1, pageSize: 1000 });
    if (wikiId !== undefined) {
      const ids = new Set<number>();
      for (const l of links) {
        if (l.source_wiki_id === wikiId || l.target_wiki_id === wikiId) {
          ids.add(l.source_wiki_id);
          ids.add(l.target_wiki_id);
        }
      }
      ids.add(wikiId);
      const reachable = await wikiRepository.listWikisByIds([...ids]);
      nodes = { items: reachable, total: reachable.length };
    }
    const visible = new Set(nodes.items.map((n) => n.id));
    const edges = links.filter((l) => visible.has(l.source_wiki_id) && visible.has(l.target_wiki_id));
    return {
      nodes: nodes.items.map((n) => ({ id: n.id, title: n.title })),
      edges: edges.map((l) => ({ source: l.source_wiki_id, target: l.target_wiki_id })),
    };
  }

  async neighbors(wikiId: number, depth?: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    const d = Math.min(Math.max(depth ?? 1, 1), 4);
    const allLinks = await wikiRepository.listAllLinks();
    const adj = new Map<number, number[]>();
    for (const l of allLinks) {
      const src = adj.get(l.source_wiki_id) ?? [];
      src.push(l.target_wiki_id);
      adj.set(l.source_wiki_id, src);
      const tgt = adj.get(l.target_wiki_id) ?? [];
      tgt.push(l.source_wiki_id);
      adj.set(l.target_wiki_id, tgt);
    }
    const visited = new Set<number>([wikiId]);
    let frontier = [wikiId];
    for (let i = 0; i < d; i++) {
      const next: number[] = [];
      for (const id of frontier) {
        for (const nb of adj.get(id) ?? []) {
          if (!visited.has(nb)) { visited.add(nb); next.push(nb); }
        }
      }
      frontier = next;
    }
    visited.delete(wikiId);
    const nodes = await wikiRepository.listWikisByIds([...visited]);
    return { wiki_id: wikiId, depth: d, neighbors: nodes.map((n) => ({ id: n.id, title: n.title })) };
  }

  async searchGraph(q: string): Promise<Record<string, unknown>> {
    if (!q?.trim()) throw new ServiceError('validation_failed', 'q is required');
    const { items } = await wikiRepository.searchWikis(q.trim(), { page: 1, pageSize: 20 });
    return { nodes: items.map((n) => ({ id: n.id, title: n.title, summary: n.summary })) };
  }

  // ── CRUD + versioning (W04) ───────────────────────────────────────────────
  async create(input: { title: string; content?: string; summary?: string; kb_id?: number }): Promise<Record<string, unknown>> {
    if (!input.title?.trim()) throw new ServiceError('validation_failed', 'title is required');
    const content = input.content ?? '';
    const wiki = await wikiRepository.createWiki({
      title: input.title.trim(),
      summary: input.summary ?? '',
      content,
      kbId: input.kb_id ?? null,
      status: 'draft',
      revisionNo: 1,
    });
    await wikiRepository.createRevision({ wikiId: wiki.id, revisionNo: 1, title: wiki.title, content, checksum: sha256(content) });
    return wiki;
  }

  async edit(wikiId: number, input: { title?: string; content?: string; summary?: string }): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    const title = input.title ?? w.title;
    const content = input.content ?? w.content;
    const summary = input.summary ?? w.summary;
    const nextRev = w.revision_no + 1;
    const updated = await wikiRepository.updateWiki(wikiId, { title, content, summary, revisionNo: nextRev });
    await wikiRepository.createRevision({ wikiId, revisionNo: nextRev, title, content, checksum: sha256(content) });
    return updated;
  }

  async remove(wikiId: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    await wikiRepository.softDeleteWiki(wikiId);
    return { deleted: true, id: wikiId };
  }

  async revisions(wikiId: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    const revs = await wikiRepository.listRevisions(wikiId);
    return { wiki_id: wikiId, items: revs, total: revs.length };
  }

  async diff(wikiId: number, input: { from_revision_no?: number; to_revision_no?: number }): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    const revs = await wikiRepository.listRevisions(wikiId);
    if (revs.length === 0) throw new ServiceError('resource_not_found', 'no revisions');
    const latest = revs[0];
    const fromRev = input.from_revision_no ?? (revs.length > 1 ? revs[1].revision_no : latest.revision_no);
    const toRev = input.to_revision_no ?? latest.revision_no;
    const from = await wikiRepository.findRevision(wikiId, fromRev);
    const to = await wikiRepository.findRevision(wikiId, toRev);
    if (!from || !to) throw new ServiceError('resource_not_found', 'revision not found');

    const script = diffLines(from.content, to.content);
    const added = script.filter((s) => s.type === 'add').length;
    const removed = script.filter((s) => s.type === 'remove').length;
    return {
      wiki_id: wikiId,
      from_revision_no: fromRev,
      to_revision_no: toRev,
      added_lines: added,
      removed_lines: removed,
      changed: added > 0 || removed > 0,
      patch: script,
    };
  }

  async revert(wikiId: number, revisionNo: number): Promise<Record<string, unknown>> {
    const w = await wikiRepository.findWikiById(wikiId);
    if (!w) throw new ServiceError('resource_not_found', 'wiki not found');
    const target = await wikiRepository.findRevision(wikiId, revisionNo);
    if (!target) throw new ServiceError('resource_not_found', 'revision not found');
    const nextRev = w.revision_no + 1;
    await wikiRepository.updateWiki(wikiId, { title: target.title, content: target.content, summary: summaryOf(target.content), revisionNo: nextRev });
    await wikiRepository.createRevision({ wikiId, revisionNo: nextRev, title: target.title, content: target.content, checksum: sha256(target.content) });
    return { wiki_id: wikiId, reverted_from_revision_no: revisionNo, new_revision_no: nextRev };
  }
}

export const wikiService = new WikiService();
