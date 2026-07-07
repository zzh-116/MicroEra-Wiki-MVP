import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { aiService } from '../../backend/ai/service.js';
import { importJob } from '../../backend/metadata/importJob.js';
import { metadataStore } from '../../backend/metadata/store.js';
import { memoryVectorStore } from '../../backend/vector/memory.js';
import { config } from '../../backend/config.js';

export const aiRouter = Router();

// POST /api/ai/chat — RAG-powered conversational Q&A
aiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { question, history } = req.body || {};
    if (!question?.trim()) { res.json({ answer: '请提出一个问题。', sources: [] }); return; }
    const { answer, sources } = await aiService.chat(question, history || []);
    res.json({ answer, sources: sources.map((s: any) => ({ id: s.id, title: s.title, entry_type: s.entry_type })) });
  } catch (err: any) {
    res.status(503).json({ error: 'AI_SERVICE_UNAVAILABLE', message: err.message });
  }
});

aiRouter.post('/summarize', async (req: Request, res: Response) => {
  try {
    const { entryId } = req.body || {};
    if (!entryId) { res.status(400).json({ error: 'MISSING_ENTRY_ID', message: '请提供 entryId' }); return; }
    const summary = await aiService.summarize(Number(entryId));
    res.json({ summary });
  } catch (err: any) {
    res.status(503).json({ error: 'AI_SERVICE_UNAVAILABLE', message: err.message });
  }
});

// POST /api/ai/import — trigger import pipeline
aiRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const { filePath, content } = req.body || {};
    let result;
    if (filePath) {
      result = await importJob.importFromFile(filePath);
    } else if (content) {
      result = await importJob.importFromString(content);
    } else {
      res.status(400).json({ error: 'MISSING_INPUT', message: '请提供 filePath 或 content' });
      return;
    }
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: 'IMPORT_FAILED', message: err.message });
  }
});

// POST /api/ai/reset — wipe imported data and reimport cleanly
aiRouter.post('/reset', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body || {};
    const fp = filePath || 'backend/data/materials-metadata.md';

    // 1. Wipe all imported entries (keep seed entries 1-8)
    const entries = metadataStore.getEntries({}, true);
    for (const e of entries) {
      if (e.id > 8) metadataStore.deleteEntry(e.id);
    }

    // 2. Wipe vectors and documents
    const vectorsFile = path.resolve(config.dataDir, 'vectors.json');
    if (fs.existsSync(vectorsFile)) fs.unlinkSync(vectorsFile);
    const docsDir = path.resolve(config.dataDir, 'documents');
    if (fs.existsSync(docsDir)) {
      for (const f of fs.readdirSync(docsDir)) fs.unlinkSync(path.join(docsDir, f));
    }

    // 3. Reconnect memory store (fresh)
    await memoryVectorStore.connect();

    // 4. Reimport
    const result = await importJob.importFromFile(fp);

    res.json({ success: true, reset: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: 'RESET_FAILED', message: err.message });
  }
});
