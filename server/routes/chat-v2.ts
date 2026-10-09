// Chat v2 operations — REST surface for the chat.* / session.* / message.*
// verbs (P4). Mirrors knowledge-v2.ts / retrieval-v2.ts: handlers resolve a
// ServiceError onto the wire contract so CLI/MCP clients see identical JSON to
// raw HTTP. `chat.stream` is the one exception — it streams Server-Sent Events
// (and falls back to a single JSON answer when `stream:false` is requested).
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { chatService } from '../../backend/services/chat.service.js';
import { ServiceError } from '../../backend/services/knowledge.service.js';
import { ok, fail, newTraceId } from '../../packages/contracts/src/wire.js';
import type { ErrorKindKey } from '../../packages/contracts/src/wire.js';

export const chatV2Router = Router();

chatV2Router.use(requireAuth);

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

function uid(req: Request): number {
  return req.user!.userId;
}

/** Read an identifier from query params first (GET/DELETE), then body. */
function idFrom(req: Request, key: string): any {
  return req.query?.[key] ?? req.body?.[key];
}

// ── P4-01: chat.ask ──────────────────────────────────────────────────────────
chatV2Router.post('/chat/ask', (req, res) =>
  handle('chat.ask', req, res, () =>
    chatService.ask({
      question: req.body?.question,
      kb_ids: Array.isArray(req.body?.kb_ids) ? req.body.kb_ids.map((x: any) => toInt(x)) : undefined,
      session_id: req.body?.session_id,
      top_k: toInt(req.body?.top_k),
      method: req.body?.method,
      is_internal: req.body?.is_internal,
      user_id: uid(req),
    })));

// ── P4-02: citations ─────────────────────────────────────────────────────────
chatV2Router.post('/chat/references', (req, res) =>
  handle('chat.references', req, res, () =>
    chatService.references(uid(req), req.body?.message_id)));

chatV2Router.get('/chat/citation_read', (req, res) =>
  handle('chat.citation_read', req, res, () =>
    chatService.citationRead(String(idFrom(req, 'chunk_id') ?? ''))));

chatV2Router.post('/chat/verify_citations', (req, res) =>
  handle('chat.verify_citations', req, res, () =>
    chatService.verifyCitations(uid(req), req.body?.message_id)));

// ── P4-03: sessions + messages ───────────────────────────────────────────────
chatV2Router.post('/session/create', (req, res) =>
  handle('session.create', req, res, () =>
    chatService.createSession({
      user_id: uid(req),
      title: req.body?.title,
      kb_ids: Array.isArray(req.body?.kb_ids) ? req.body.kb_ids.map((x: any) => toInt(x)) : undefined,
      scope: req.body?.scope,
    })));

chatV2Router.get('/session/list', (req, res) =>
  handle('session.list', req, res, () =>
    chatService.listSessions(uid(req), {
      page: toInt(req.query.page),
      page_size: toInt(req.query.page_size),
    })));

chatV2Router.get('/session/view', (req, res) =>
  handle('session.view', req, res, () =>
    chatService.viewSession(uid(req), String(idFrom(req, 'session_id') ?? ''))));

chatV2Router.delete('/session/delete', (req, res) =>
  handle('session.delete', req, res, () =>
    chatService.deleteSession(uid(req), String(idFrom(req, 'session_id') ?? ''))));

chatV2Router.get('/message/list', (req, res) =>
  handle('message.list', req, res, () =>
    chatService.listMessages(uid(req), String(idFrom(req, 'session_id') ?? ''))));

chatV2Router.get('/message/view', (req, res) =>
  handle('message.view', req, res, () =>
    chatService.viewMessage(uid(req), String(idFrom(req, 'message_id') ?? ''))));

chatV2Router.post('/message/search', (req, res) =>
  handle('message.search', req, res, () =>
    chatService.searchMessages(uid(req), { q: req.body?.q, session_id: req.body?.session_id })));

// ── P4-04: streaming + cancellation ─────────────────────────────────────────
chatV2Router.post('/chat/stream', (req, res) => {
  const input = {
    question: req.body?.question,
    kb_ids: Array.isArray(req.body?.kb_ids) ? req.body.kb_ids.map((x: any) => toInt(x)) : undefined,
    session_id: req.body?.session_id,
    top_k: toInt(req.body?.top_k),
    method: req.body?.method,
    is_internal: req.body?.is_internal,
    user_id: uid(req),
  };

  // JSON fallback for CLI/MCP (and any non-SSE client).
  if (req.body?.stream === false) {
    return handle('chat.stream', req, res, () => chatService.ask(input));
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  (async () => {
    try {
      for await (const ev of chatService.stream(input)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      }
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err?.message ?? 'internal error' })}\n\n`);
    } finally {
      res.end();
    }
  })();
});

chatV2Router.post('/chat/cancel', (req, res) =>
  handle('chat.cancel', req, res, () =>
    chatService.cancel(String(req.body?.session_id ?? ''))));

chatV2Router.post('/session/stop', (req, res) =>
  handle('session.stop', req, res, () =>
    chatService.cancel(String(req.body?.session_id ?? ''))));

// ── P4-05: session-scoped ask + scope editing ────────────────────────────────
chatV2Router.post('/session/ask', (req, res) =>
  handle('session.ask', req, res, async () => {
    const session_id = req.body?.session_id;
    if (!session_id) throw new ServiceError('validation_failed', 'session_id is required');
    return chatService.ask({
      question: req.body?.question,
      session_id,
      kb_ids: Array.isArray(req.body?.kb_ids) ? req.body.kb_ids.map((x: any) => toInt(x)) : undefined,
      top_k: toInt(req.body?.top_k),
      method: req.body?.method,
      is_internal: req.body?.is_internal,
      user_id: uid(req),
    });
  }));

chatV2Router.post('/chat/scope', (req, res) =>
  handle('chat.scope', req, res, () =>
    chatService.setScope(uid(req), String(req.body?.session_id ?? ''), {
      kb_ids: Array.isArray(req.body?.kb_ids) ? req.body.kb_ids.map((x: any) => toInt(x)) : undefined,
      top_k: toInt(req.body?.top_k),
      method: req.body?.method,
    })));

// ── P4-06: trace + export ────────────────────────────────────────────────────
chatV2Router.get('/chat/trace', (req, res) =>
  handle('chat.trace', req, res, () =>
    chatService.trace(uid(req), String(idFrom(req, 'message_id') ?? ''))));

chatV2Router.post('/session/export', (req, res) =>
  handle('session.export', req, res, () =>
    chatService.exportSession(uid(req), String(req.body?.session_id ?? ''))));
