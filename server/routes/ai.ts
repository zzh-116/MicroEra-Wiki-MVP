import { Router, Request, Response } from 'express';
import { aiService } from '../../backend/services/ai.service.js';
import { importService } from '../../backend/services/import.service.js';
import { entryRepository } from '../../backend/repositories/entry.repository.js';
import { chunkRepository } from '../../backend/repositories/chunk.repository.js';
import { vectorRepository } from '../../backend/repositories/vector.repository.js';
import { conversationRepository } from '../../backend/repositories/conversation.repository.js';

export const aiRouter = Router();

// POST /api/ai/chat — RAG Q&A with conversation persistence
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
