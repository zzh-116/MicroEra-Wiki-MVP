// Sandbox Connector — implements the Connector interface for the Sandbox data platform.
// Two modes:
//   1. DB mode (SANDBOX_DB_ENABLED=true): Direct MySQL reads, single SQL JOIN
//   2. HTTP mode (default): REST API crawling through the existing HTTP connector
//
// DB mode is preferred when the sandbox MySQL is accessible — it eliminates N+1 HTTP
// requests and provides access to project_wiki, project_task, and sys_user data.

import type { Connector, Document, DocumentSummary, SyncResult, ListParams, SyncParams } from '../types.js';
import { config } from '../../config.js';

// ---- HTTP mode imports ----
import { listDocuments as httpListDocuments, fetchDocument as httpFetchDocument, syncAll as httpSyncAll, syncIncremental as httpSyncIncremental, getLastSyncTime as httpGetLastSyncTime } from './sync.js';
import { getToken, login as httpLogin } from './auth.js';
import { getProjects as httpGetProjects } from './client.js';

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
 * Implements the same Connector interface but uses SQL instead of HTTP.
 */
export class SandboxDBConnector implements Connector {
  readonly name = 'sandbox-db';
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
    // Try snapshot ObjectId first, then numeric asset_id
    let doc = await dbFetchDocument(id);
    if (!doc) {
      // If the id looks like a number, try asset_id lookup
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

  /**
   * Bulk fetch all documents in one query — eliminates N+1 detail() calls.
   * Preferred for bulk import over list() + loop detail().
   */
  async fetchAll(params?: ListParams): Promise<Document[]> {
    return dbFetchAllDocuments(params);
  }

  /** List available projects */
  async listProjects() {
    return dbListProjects();
  }

  /** List project wikis as documents */
  async listWikis(params?: ListParams): Promise<DocumentSummary[]> {
    return dbListProjectWikis(params);
  }

  /** Fetch a single project wiki */
  async fetchWiki(projectId: string): Promise<Document> {
    const doc = await dbFetchProjectWiki(projectId);
    if (!doc) throw new Error(`Wiki not found for project: ${projectId}`);
    return doc;
  }

  /** List project tasks as documents */
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

  /** For DB mode, last sync is tracked by the caller (not file-based) */
  getLastSync(): string | null {
    return null; // DB mode uses the caller's sync tracking
  }
}

/**
 * SandboxConnector — HTTP API connector (original, kept as fallback).
 */
export class SandboxConnector implements Connector {
  readonly name = 'sandbox';
  readonly label = 'Sandbox 数字资产平台 (HTTP API)';
  readonly version = '1.0.0';

  async connect(): Promise<void> {
    await httpLogin();
  }

  async list(params?: ListParams): Promise<DocumentSummary[]> {
    await getToken();
    return httpListDocuments(params);
  }

  async detail(id: string): Promise<Document> {
    await getToken();
    return httpFetchDocument(id);
  }

  async sync(params?: SyncParams): Promise<SyncResult> {
    await getToken();

    if (params?.since) {
      return httpSyncAll({ since: params.since, projectId: params.projectId });
    }

    return httpSyncIncremental();
  }

  async listProjects() {
    await getToken();
    return httpGetProjects();
  }

  getLastSync(): string | null {
    return httpGetLastSyncTime();
  }
}

/** Auto-select the best connector based on config */
function createConnector(): Connector {
  if (config.sandboxDB.enabled) {
    console.log('[Sandbox] Using DB connector (direct MySQL)');
    return new SandboxDBConnector();
  }
  console.log('[Sandbox] Using HTTP connector (REST API)');
  return new SandboxConnector();
}

export const sandboxConnector = createConnector();

