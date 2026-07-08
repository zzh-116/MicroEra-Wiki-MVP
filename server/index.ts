import 'dotenv/config';
import { createApp } from '../backend/app.js';
import { config } from '../backend/config.js';

async function main() {
  const app = await createApp({ cors: true, serveStatic: true, bootstrap: true });

  app.listen(config.port, () => {
    console.log(`\n  MicroEra Wiki MVP — http://localhost:${config.port}`);
    console.log(`  API Docs:  http://localhost:${config.port}/api/docs`);
    console.log(`  Health:    http://localhost:${config.port}/api/pipeline/health\n`);
  });
}

main().catch((err) => { console.error('[Server] Failed:', err); process.exit(1); });
