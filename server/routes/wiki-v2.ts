// Wiki v2 operations — REST surface for the wiki.* / graph.* verbs (P5).
// Mirrors knowledge-v2.ts / retrieval-v2.ts / chat-v2.ts: handlers resolve a
// ServiceError onto the wire contract so CLI/MCP clients see identical JSON.
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { wikiService } from '../../backend/services/wiki.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const wikiV2Router = Router();

wikiV2Router.use(requireAuth);

function toInt(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const ERROR_STATUS: Record<ServiceError['kind'], number> = {
  resource_not_found: 404,
  validation_failed: 400,
  conflict: 409,
  internal: 500,
};

async function handle(
  op: string,
  req: Request,
  res: Response,
  fn: () => Promise<unknown>,
): Promise<void> {
  const trace = newTraceId();
  try {
    const data = await fn();
    res.json(ok(op, data, trace));
  } catch (err: any) {
    if (err instanceof ServiceError) {
      const status = ERROR_STATUS[err.kind];
      res.status(status).json(fail(op, err.kind as ErrorKindKey, err.message, trace));
      return;
    }
    res.status(500).json(fail(op, 'internal', err?.message ?? 'internal error', trace));
  }
}

function idFrom(req: Request, key: string): any {
  return req.query?.[key] ?? req.body?.[key];
}

// ── W01: generate / status / list / read / search ───────────────────────────
wikiV2Router.post('/wiki/generate', (req, res) =>
  handle('wiki.generate', req, res, () =>
    wikiService.generate({
      title: req.body?.title,
      question: req.body?.question,
      kb_id: toInt(req.body?.kb_id),
      document_ids: Array.isArray(req.body?.document_ids) ? req.body.document_ids.map((x: any) => toInt(x)) : undefined,
      top_k: toInt(req.body?.top_k),
      method: req.body?.method,
    })));

wikiV2Router.get('/wiki/status', (req, res) =>
  handle('wiki.status', req, res, () => wikiService.status(Number(idFrom(req, 'wiki_id')))));

wikiV2Router.get('/wiki/list', (req, res) =>
  handle('wiki.list', req, res, () =>
    wikiService.list({ page: toInt(req.query.page), page_size: toInt(req.query.page_size), kb_id: toInt(req.query.kb_id) })));

wikiV2Router.get('/wiki/read', (req, res) =>
  handle('wiki.read', req, res, () => wikiService.read(Number(idFrom(req, 'wiki_id')))));

wikiV2Router.post('/wiki/search', (req, res) =>
  handle('wiki.search', req, res, () =>
    wikiService.search({ q: req.body?.q, page: toInt(req.body?.page), page_size: toInt(req.body?.page_size) })));

// ── W02: sources / citations ────────────────────────────────────────────────
wikiV2Router.get('/wiki/sources', (req, res) =>
  handle('wiki.sources', req, res, () => wikiService.sources(Number(idFrom(req, 'wiki_id')))));

wikiV2Router.get('/wiki/citation_read', (req, res) =>
  handle('wiki.citation_read', req, res, () => wikiService.citationRead(String(idFrom(req, 'chunk_id') ?? ''))));

wikiV2Router.post('/wiki/verify', (req, res) =>
  handle('wiki.verify', req, res, () => wikiService.verify(Number(idFrom(req, 'wiki_id')))));

// ── W03: links + graph ──────────────────────────────────────────────────────
wikiV2Router.get('/wiki/links', (req, res) =>
  handle('wiki.links', req, res, () => wikiService.links(Number(idFrom(req, 'wiki_id')))));

wikiV2Router.post('/wiki/link', (req, res) =>
  handle('wiki.link', req, res, () =>
    wikiService.link(Number(req.body?.source_wiki_id), Number(req.body?.target_wiki_id))));

wikiV2Router.post('/wiki/unlink', (req, res) =>
  handle('wiki.unlink', req, res, () =>
    wikiService.unlink(Number(req.body?.source_wiki_id), Number(req.body?.target_wiki_id))));

wikiV2Router.get('/wiki/graph', (req, res) =>
  handle('wiki.graph', req, res, () => wikiService.graph(toInt(req.query.wiki_id))));

wikiV2Router.get('/graph/neighbors', (req, res) =>
  handle('graph.neighbors', req, res, () =>
    wikiService.neighbors(Number(idFrom(req, 'wiki_id')), toInt(req.query.depth))));

wikiV2Router.post('/graph/search', (req, res) =>
  handle('graph.search', req, res, () => wikiService.searchGraph(req.body?.q)));

// ── W04: create / edit / delete / diff / revert / revisions ────────────────
wikiV2Router.post('/wiki/create', (req, res) =>
  handle('wiki.create', req, res, () =>
    wikiService.create({
      title: req.body?.title,
      content: req.body?.content,
      summary: req.body?.summary,
      kb_id: toInt(req.body?.kb_id),
    })));

wikiV2Router.patch('/wiki/edit', (req, res) =>
  handle('wiki.edit', req, res, () =>
    wikiService.edit(Number(req.body?.wiki_id), {
      title: req.body?.title,
      content: req.body?.content,
      summary: req.body?.summary,
    })));

wikiV2Router.delete('/wiki/delete', (req, res) =>
  handle('wiki.delete', req, res, () => wikiService.remove(Number(idFrom(req, 'wiki_id')))));

wikiV2Router.post('/wiki/diff', (req, res) =>
  handle('wiki.diff', req, res, () =>
    wikiService.diff(Number(req.body?.wiki_id), {
      from_revision_no: toInt(req.body?.from_revision_no),
      to_revision_no: toInt(req.body?.to_revision_no),
    })));

wikiV2Router.post('/wiki/revert', (req, res) =>
  handle('wiki.revert', req, res, () =>
    wikiService.revert(Number(req.body?.wiki_id), Number(req.body?.revision_no))));

wikiV2Router.get('/wiki/revisions', (req, res) =>
  handle('wiki.revisions', req, res, () => wikiService.revisions(Number(idFrom(req, 'wiki_id')))));
