// Local Sample Connector — an in-process, credential-free data source used for
// testing and demos. It produces a fixed set of deterministic Markdown documents
// that flow through the real import pipeline (chunk → embed → vector), so
// datasource.sync / datasource.changes behave exactly like a live connector.
import type { Connector, Document, DocumentSummary, SyncResult, ListParams, SyncParams } from '../types.js';
import { ConnectorRegistry } from '../registry.js';

const DOCS: Document[] = [
  {
    id: 'local-1',
    title: 'Sample Materials Datasheet',
    type: 'data_item',
    updatedAt: '2026-01-15T00:00:00.000Z',
    description: 'Deterministic sample material datasheet.',
    content: '# Sample Materials Datasheet\n\n## Overview\n\nA deterministic sample material used to exercise the connector import pipeline.\n\n## Properties\n\nThe material exhibits stable, reproducible properties suitable for demonstration purposes.\n',
    attachments: [],
    source: 'local',
    tags: ['sample', 'material'],
    author: 'MicroEra',
    metadata: { source: 'local', kind: 'datasheet' },
  },
  {
    id: 'local-2',
    title: 'Sample Research Note',
    type: 'academic_paper',
    updatedAt: '2026-01-20T00:00:00.000Z',
    description: 'Deterministic sample research note.',
    content: '# Sample Research Note\n\n## Abstract\n\nThis note describes a deterministic research finding for connector smoke tests.\n\n## Method\n\nThe method is fully reproducible and requires no external services.\n',
    attachments: [],
    source: 'local',
    tags: ['sample', 'research'],
    author: 'MicroEra',
    metadata: { source: 'local', kind: 'paper' },
  },
  {
    id: 'local-3',
    title: 'Sample Project Wiki',
    type: 'wiki',
    updatedAt: '2026-01-25T00:00:00.000Z',
    description: 'Deterministic sample project wiki page.',
    content: '# Sample Project Wiki\n\n## Goals\n\nDemonstrate connector-based wiki import.\n\n## Status\n\nComplete.\n',
    attachments: [],
    source: 'local',
    tags: ['sample', 'wiki'],
    author: 'MicroEra',
    metadata: { source: 'local', kind: 'wiki' },
  },
];

function filterBySince(docs: Document[], since?: string): Document[] {
  if (!since) return docs;
  return docs.filter((d) => d.updatedAt > since);
}

export class LocalConnector implements Connector {
  readonly name = 'local';
  readonly label = 'Local Sample Source';
  readonly version = '1.0.0';

  async connect(): Promise<void> {
    // In-process source — nothing to authenticate.
  }

  async list(params?: ListParams): Promise<DocumentSummary[]> {
    return filterBySince(DOCS, params?.since).map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      updatedAt: d.updatedAt,
      description: d.description,
      metadata: d.metadata,
    }));
  }

  async detail(id: string): Promise<Document> {
    const doc = DOCS.find((d) => d.id === id);
    if (!doc) throw new Error(`local: document not found: ${id}`);
    return doc;
  }

  async fetchAll(params?: ListParams): Promise<Document[]> {
    return filterBySince(DOCS, params?.since);
  }

  async sync(params?: SyncParams): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const docs = filterBySince(DOCS, params?.since);
    return {
      connector: this.name,
      total: docs.length,
      created: docs.length,
      updated: 0,
      skipped: 0,
      errors: [],
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - t0,
    };
  }
}

ConnectorRegistry.register('local', () => new LocalConnector());
