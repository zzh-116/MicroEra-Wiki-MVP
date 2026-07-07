// Standalone Backend Entry Point
// Starts the Express server with the full enterprise data pipeline.
//
// Usage:
//   npx tsx backend/main.ts
//
// This is separate from server/index.ts — it does NOT serve the Vite SPA.
// Use this when you want only the API server (e.g., for API-only deployment).

import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './config.js';

async function main() {
  const app = await createApp({
    cors: true,
    serveStatic: false, // API-only mode
    bootstrap: true,
  });

  const PORT = config.port;

  app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║   MicroEra Wiki MVP — Enterprise Data Pipeline API   ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║   Server:    http://localhost:${PORT}                   ║`);
    console.log(`║   API Docs:  http://localhost:${PORT}/api/docs           ║`);
    console.log(`║   Health:    http://localhost:${PORT}/api/pipeline/health║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║   Ollama:    ${config.ollama.url.padEnd(40)}║`);
    console.log(`║   Chat:      ${config.ollama.chatModel.padEnd(40)}║`);
    console.log(`║   Embedding: ${config.ollama.embeddingModel.padEnd(40)}║`);
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Enterprise Data Pipeline:');
    console.log('  Upload → Parse → Document → Chunk → Embed → Vector → Retrieve → LLM');
    console.log('');
    console.log('Quick test:');
    console.log('  curl http://localhost:3001/api/pipeline/health | npx json');
    console.log('');
  });
}

main().catch((err) => {
  console.error('[Main] Failed to start:', err);
  process.exit(1);
});
