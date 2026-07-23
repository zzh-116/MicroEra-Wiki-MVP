// Sandbox Connector — DB-only connector for the Sandbox data platform.
// Direct MySQL reads, single SQL JOIN. No HTTP API dependency.
//
// Provides access to: assets (asset_version), projects, project_wiki, project_task, sys_user.
// All data sources are synced to Wiki on startup via autoSyncSandbox().

import type { Connector, Document, DocumentSummary, SyncResult, ListParams, SyncParams } from '../types.js';

// ---- DB mode imports ----
import {
  listDocuments as dbListDocuments,
  fetchDocument as dbFetchDocument,
  fetchDocumentByAssetId as dbFetchDocumentByAssetId,
  syncAll as dbSyncAll,
  fetchAllDocuments as dbFetchAllDocuments,
  listProjects as dbListProjects,
  listProjectWikis as dbListProjectWikis,
  fetchProjectWiki as dbFetchProjectWiki,
  listProjectTasks as dbListProjectTasks,
  fetchProjectTask as dbFetchProjectTask,
  testConnection as dbTestConnection,
} from './db-sync.js';

/**
 * SandboxDBConnector — direct MySQL connector.
 */
export class SandboxDBConnector implements Connector {
  readonly name = 'sandbox';
  readonly label = 'Sandbox 数字资产平台 (直连数据库)';
  readonly version = '2.0.0';

  private connected = false;

  async connect(): Promise<void> {
    const result = await dbTestConnection();
    if (!result.connected) {
      throw new Error(`Sandbox DB connection failed: ${result.error}`);
    }
    this.connected = true;
    console.log(`[Sandbox:DB] Connected — ${result.assetCount} assets, ${result.projectCount} projects, ${result.wikiCount} wikis`);
  }

  async list(params?: ListParams): Promise<DocumentSummary[]> {
    return dbListDocuments(params);
  }

  async detail(id: string): Promise<Document> {
    let doc = await dbFetchDocument(id);
    if (!doc) {
      if (/^\d+$/.test(id)) {
        doc = await dbFetchDocumentByAssetId(id);
      }
    }
    if (!doc) {
      throw new Error(`Asset not found: ${id}`);
    }
    return doc;
  }

  async sync(params?: SyncParams): Promise<SyncResult> {
    return dbSyncAll({
      since: params?.since,
      projectId: params?.projectId,
    });
  }

  /** Bulk fetch all asset documents in one query — no N+1. */
  async fetchAll(params?: ListParams): Promise<Document[]> {
    return dbFetchAllDocuments(params);
  }

  /** List available projects */
  async listProjects() {
    return dbListProjects();
  }

  /** List project wikis as document summaries */
  async listWikis(params?: ListParams): Promise<DocumentSummary[]> {
    return dbListProjectWikis(params);
  }

  /** Fetch a single project wiki */
  async fetchWiki(projectId: string): Promise<Document> {
    const doc = await dbFetchProjectWiki(projectId);
    if (!doc) throw new Error(`Wiki not found for project: ${projectId}`);
    return doc;
  }

  /** List project tasks as document summaries */
  async listTasks(params?: ListParams): Promise<DocumentSummary[]> {
    return dbListProjectTasks(params);
  }

  /** Fetch a single project task */
  async fetchTask(taskId: string): Promise<Document> {
    const doc = await dbFetchProjectTask(taskId);
    if (!doc) throw new Error(`Task not found: ${taskId}`);
    return doc;
  }

  /** Test DB connectivity and return stats */
  async testConnection() {
    return dbTestConnection();
  }

  getLastSync(): string | null {
    return null;
  }
}

// Always use DB connector
console.log('[Sandbox] Using DB connector (direct MySQL)');
export const sandboxConnector = new SandboxDBConnector();
