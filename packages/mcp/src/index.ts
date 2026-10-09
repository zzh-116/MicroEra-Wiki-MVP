// MCP entry — dispatches `microera mcp serve --transport stdio|http`.
import { startStdioServer } from './stdio.js';
import { runHttpServer } from './http.js';

export { listTools, listResources, listPrompts, readResource, callTool, MCP_PROTOCOL_VERSION, serverInfo } from './mcp-core.js';

export async function runMcpServe(argv: string[]): Promise<number> {
  const transport = argv.includes('--transport') && argv[argv.indexOf('--transport') + 1] === 'http'
    ? 'http'
    : 'stdio';
  const portFlag = argv.indexOf('--port');
  const port = portFlag >= 0 ? Number(argv[portFlag + 1]) || 8765 : 8765;

  if (transport === 'http') {
    await runHttpServer(port);
    // Keep the process alive (the server keeps the event loop busy).
    return new Promise(() => {});
  }
  await startStdioServer();
  return 0;
}
