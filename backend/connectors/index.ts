// Connectors — public API for the connector layer.
//
// Usage:
//   import { ConnectorRegistry, sandboxConnector } from '../connectors/index.js';
//   ConnectorRegistry.register('sandbox', () => sandboxConnector);
//
//   const c = ConnectorRegistry.get('sandbox');
//   await c.connect();
//   const docs = await c.list({ projectId: '155' });
//   const detail = await c.detail('operator-123');
//   const result = await c.sync({ projectId: '155' });

export { ConnectorRegistry } from './registry.js';
export { sandboxConnector, SandboxDBConnector } from './sandbox/index.js';
export { ArxivConnector } from './arxiv/index.js';
export type {
  Connector,
  Document,
  DocumentSummary,
  Attachment,
  SyncResult,
  ListParams,
  SyncParams,
} from './types.js';
