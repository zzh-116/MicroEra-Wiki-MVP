import { Router, Request, Response } from 'express';
import { aiService } from '../../backend/services/ai.service.js';
import { importService } from '../../backend/services/import.service.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { chunkRepository } from '../../backend/repositories/chunk.repository.js';
import { vectorRepository } from '../../backend/repositories/vector.repository.js';
import { conversationRepository } from '../../backend/repositories/conversation.repository.js';
import { sseStart, sseStartEvent, sseToken, sseDone, sseError } from '../../backend/llm/sse.js';

export const aiRouter = Router();

// POST /api/ai/chat — non-streaming RAG Q&A (backward compatible)
aiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { question, history, conversationId } = req.body || {};
    if (!question?.trim()) { res.json({ answer: '请提出一个问题。', sources: [] }); return; }
    const userId = req.user?.userId;
    const result = await aiService.chat(question, userId, conversationId);
    res.json({ answer: result.answer, sources: result.sources.map((s) => ({ id: s.id, title: s.title, entry_type: s.entry_type })), conversationId: result.conversationId });
  } catch (err: any) {
    res.status(503).json({ error: 'AI_SERVICE_UNAVAILABLE', message: err.message });
  }
});

// POST /api/ai/chat/stream — SSE streaming RAG Q&A
aiRouter.post('/chat/stream', async (req: Request, res: Response) => {
  const tRoute = Date.now();
  console.log('[SSE] POST /chat/stream — request received');

  const send = sseStart(res);

  try {
    const { question, conversationId } = req.body || {};
    if (!question?.trim()) {
      sseError(send, res, '请提出一个问题。');
      return;
    }

    const userId = req.user?.userId;

    // Track connection state for diagnostics
    let streamFinished = false;
    let streamingStarted = false;
    req.on('close', () => {
      const elapsed = Date.now() - tRoute;
      if (streamFinished) {
        console.log(`[SSE] Connection closed normally after stream completion (${elapsed}ms)`);
      } else if (streamingStarted) {
        // Only log premature disconnect if we've started sending events.
        // Preflight/early TCP closes (< 100ms) are normal browser behavior.
        console.log(`[SSE] Client disconnected during streaming (${elapsed}ms, ${eventCount} events sent) — request aborted or network issue`);
      }
    });

    let eventCount = 0;
    for await (const event of aiService.streamChat(question, userId, conversationId)) {
      eventCount++;
      if (!streamingStarted) streamingStarted = true;
      switch (event.type) {
        case 'start':
          sseStartEvent(send, event.conversationId);
          console.log(`[SSE] → start  convId=${event.conversationId}`);
          break;
        case 'token':
          sseToken(send, event.content);
          break;
        case 'done':
          sseDone(send, event);
          streamFinished = true;
          console.log(`[SSE] → done   sources=${event.sources.length} convId=${event.conversationId} (${eventCount} events, ${Date.now() - tRoute}ms)`);
          res.end();
          break;
        case 'error':
          sseError(send, res, event.message);
          streamFinished = true;
          console.log(`[SSE] → error  "${event.message}" (${Date.now() - tRoute}ms)`);
          break;
      }
    }

    // If the generator finished without yielding done/error, close gracefully
    if (!streamFinished) {
      streamFinished = true;
      console.log(`[SSE] Generator ended without explicit done/error — closing (${Date.now() - tRoute}ms)`);
      if (!res.writableEnded) res.end();
    }
  } catch (err: any) {
    console.error(`[SSE] Exception: ${err.message} (${Date.now() - tRoute}ms)`);
    if (!res.writableEnded) {
      sseError(send, res, err.message || 'Internal error');
    }
  }
});

aiRouter.post('/summarize', async (req: Request, res: Response) => {
  try {
    const { entryId } = req.body || {};
    if (!entryId) { res.status(400).json({ error: 'MISSING_ENTRY_ID', message: '请提供 entryId' }); return; }
    res.json({ summary: await aiService.summarize(Number(entryId)) });
  } catch (err: any) {
    res.status(503).json({ error: 'AI_SERVICE_UNAVAILABLE', message: err.message });
  }
});

// GET /api/ai/conversations — list user conversations
aiRouter.get('/conversations', async (req: Request, res: Response) => {
  if (!req.user?.userId) { res.json([]); return; }
  res.json(await conversationRepository.findByUserId(req.user.userId));
});

// GET /api/ai/conversations/:id — get messages
aiRouter.get('/conversations/:id', async (req: Request, res: Response) => {
  res.json(await conversationRepository.getMessages(Number(req.params.id)));
});

// POST /api/ai/import — trigger import
aiRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const { filePath, content } = req.body || {};
    let result;
    if (filePath) result = await importService.import({ mode: 'batch', source: filePath, fileName: filePath });
    else if (content) result = await importService.importFromApi(content, 'api_import.md');
    else { res.status(400).json({ error: 'MISSING_INPUT', message: '请提供 filePath 或 content' }); return; }
    res.json({ success: result.success, ...result });
  } catch (err: any) {
    res.status(500).json({ error: 'IMPORT_FAILED', message: err.message });
  }
});

// POST /api/ai/reset — wipe and reimport
aiRouter.post('/reset', async (req: Request, res: Response) => {
  try {
    const fp = req.body?.filePath || 'backend/data/materials-metadata.md';

    // Delete non-seed entries
    const all = await entryRepository.findMany({ isInternal: true });
    for (const e of all) { if (e.id > 8) await entryRepository.delete(e.id); }

    await chunkRepository.deleteAll();
    await vectorRepository.clear();

    const result = await importService.import({ mode: 'batch', source: fp, fileName: fp });
    res.json({ success: true, reset: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: 'RESET_FAILED', message: err.message });
  }
});
