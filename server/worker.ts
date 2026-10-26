// Standalone parse-job worker entry (2b Phase 0/1).
//
// Run with `npm run worker` (tsx server/worker.ts). It assumes the schema is
// already migrated by the server; it deliberately does NOT run migrations itself
// (migrations belong to the server bootstrap, and two processes migrating the
// same database would race).
//
// Phase 1/2 wires the routed parse processor: pure-text fast path for documents
// whose `content` is already markdown, and the Docling path for stored
// PDF/DOCX (MD/TXT read directly). Each leased job runs read → extract → chunk
// → embed → fenced atomic publish.
import 'dotenv/config';
import { config } from '../backend/config.js';
import { ParseWorker } from '../backend/services/parse-worker.service.js';
import { createParseProcessor } from '../backend/services/parse-processor.service.js';
import { closePool } from '../backend/db/connection.js';

async function main(): Promise<void> {
  const worker = new ParseWorker({
    owner: config.worker.owner,
    concurrency: config.worker.concurrency,
    pollMs: config.worker.pollMs,
    leaseSeconds: config.worker.leaseSeconds,
    heartbeatMs: config.worker.heartbeatMs,
    processor: createParseProcessor(),
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received — draining…`);
    await worker.stop();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await worker.start();
  console.log(
    `[worker] ${config.worker.owner} started (concurrency=${config.worker.concurrency}, lease=${config.worker.leaseSeconds}s)`,
  );
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
