// MicroEra Wiki — Single Canonical Entry Point
//
// Development:
//   npm run server:dev          # API only, hot reload (frontend runs via Vite :3000)
//
// Production:
//   SERVE_STATIC=true npm run server   # API + built frontend (dist/)
//
// The SERVE_STATIC env var controls whether the Express server serves the
// Vite-built SPA. Defaults to false — for development, Vite serves the
// frontend independently on its own port.
//
import 'dotenv/config';
import { createApp } from '../backend/app.js';
import { config } from '../backend/config.js';

async function main() {
  const serveStatic = process.env.SERVE_STATIC === 'true';

  const app = await createApp({
    cors: true,
    serveStatic,
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

    if (serveStatic) {
      console.log('Mode: Production (API + SPA static hosting)');
    } else {
      console.log('Mode: Development (API only — use "npm run dev" for Vite frontend)');
    }

    console.log('');
    console.log('Enterprise Data Pipeline:');
    console.log('  Upload → Parse → Document → Chunk → Embed → Vector → Retrieve → LLM');
    console.log('');
  });
}

main().catch((err) => { console.error('[Server] Failed:', err); process.exit(1); });
