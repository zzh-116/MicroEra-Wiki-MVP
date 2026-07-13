// Sandbox Connector — implements the Connector interface for the Sandbox data platform.
// Plugs into the ConnectorRegistry and exposes list / detail / sync operations.

import type { Connector, Document, DocumentSummary, SyncResult, ListParams, SyncParams } from '../types.js';
import { listDocuments, fetchDocument, syncAll, syncIncremental, getLastSyncTime } from './sync.js';
import { getToken, login } from './auth.js';
import { getProjects } from './client.js';

export class SandboxConnector implements Connector {
  readonly name = 'sandbox';
  readonly label = 'Sandbox 数字资产平台';
  readonly version = '1.0.0';

  async connect(): Promise<void> {
    await login();
  }

  async list(params?: ListParams): Promise<DocumentSummary[]> {
    await getToken(); // ensure authenticated
    return listDocuments(params);
  }

  async detail(id: string): Promise<Document> {
    await getToken();
    return fetchDocument(id);
  }

  async sync(params?: SyncParams): Promise<SyncResult> {
    await getToken();

    if (params?.since) {
      return syncAll({ since: params.since, projectId: params.projectId });
    }

    return syncIncremental();
  }

  /** List available Sandbox projects (for filtering) */
  async listProjects() {
    await getToken();
    return getProjects();
  }

  /** Get the last successful sync timestamp */
  getLastSync(): string | null {
    return getLastSyncTime();
  }
}

export const sandboxConnector = new SandboxConnector();
