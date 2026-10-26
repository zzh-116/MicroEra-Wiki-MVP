// MCP entry — dispatches `microera mcp serve --transport stdio|http`.
import { startStdioServer } from './stdio.js';
import { runHttpServer } from './http.js';

export { listTools, listResources, listPrompts, readResource, callTool, MCP_PROTOCOL_VERSION, serverInfo } from './mcp-core.js';

export async function runMcpServe(argv: string[]): Promise<number> {
  let transport: 'stdio' | 'http' = 'stdio';
  let port = 8765;
  let host: string | undefined;

  // Accept both `--transport http` and `--transport=http`, likewise `--port N`
  // and `--host 127.0.0.1` / `--host=127.0.0.1`.
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let name = a;
    let inline: string | undefined;
    const eq = a.indexOf('=');
    if (eq >= 0) { name = a.slice(0, eq); inline = a.slice(eq + 1); }

    if (name === '--transport') {
      let v = inline;
      if (v === undefined && i + 1 < argv.length) v = argv[++i];
      if (v === 'http') transport = 'http';
    } else if (name === '--port') {
      let v = inline;
      if (v === undefined && i + 1 < argv.length) v = argv[++i];
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) port = n;
    } else if (name === '--host') {
      let v = inline;
      if (v === undefined && i + 1 < argv.length) v = argv[++i];
      if (v) host = v;
    }
  }

  if (transport === 'http') {
    await runHttpServer(port, { host });
    // Keep the process alive (the server keeps the event loop busy).
    return new Promise(() => {});
  }
  await startStdioServer();
  return 0;
}
