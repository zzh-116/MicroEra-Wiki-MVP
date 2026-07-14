// KnowledgeParser — normalizes raw Sandbox JSON into KnowledgeDocument.
// This is the ONLY module that reads SandboxDetail shapes.
// If Sandbox API changes, only this file needs updating.

import type {
  SandboxDetail, SandboxOperatorDetail, SandboxDotDetail, SandboxDatasetDetail,
} from '../types.js';
import type {
  KnowledgeDocument, KnowledgeType, KnowledgeProperty,
  KnowledgeReference, KnowledgeAttachment, KnowledgeMetadata,
} from './types.js';
import { resolveReferences } from './resolver.js';
import { formatProperties } from './formatter.js';

/** Map Sandbox raw type string → KnowledgeType */
function mapType(rawType: string): KnowledgeType {
  const map: Record<string, KnowledgeType> = {
    operator: 'operator',
    dot: 'module',
    dataset: 'dataset',
    post: 'project',
  };
  return map[rawType] || 'other';
}

/** Generate clean abstract from description — no IDs, no raw JSON artifacts */
function buildAbstract(detail: SandboxDetail): string {
  const desc = detail.description?.trim();
  if (desc && desc.length >= 10) {
    // Strip any raw JSON or object references
    const cleaned = desc
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
      .replace(/ObjectId\([^)]+\)/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (cleaned.length >= 6) return cleaned;
    return desc.slice(0, 200).trim();
  }
  // Generate from name/title
  return `Sandbox ${mapType((detail as any).type || 'asset')}: ${detail.name || detail.title || detail.id}`;
}

/** Build body from structured detail fields, skipping raw JSON blocks */
function buildBody(detail: SandboxDetail): string {
  const parts: string[] = [];
  const rawType = (detail as any).type || '';

  // Steps (operators)
  if ('steps' in detail && detail.steps?.length) {
    const steps = (detail as SandboxOperatorDetail).steps!;
    const sorted = [...steps].sort((a, b) => a.order - b.order);
    parts.push('## 步骤流程\n');
    for (const s of sorted) {
      parts.push(`### Step ${s.order}: ${s.name}`);
      if (s.description) parts.push(`${s.description}\n`);
    }
  }

  // Data records (datasets)
  if ('datarecords' in detail && detail.datarecords?.length) {
    parts.push('## 数据记录\n');
    parts.push(`${detail.datarecords.length} 条数据记录\n`);
  }

  // If no structured body, use description as body
  if (parts.length === 0 && detail.description) {
    return detail.description.trim();
  }

  return parts.join('\n');
}

/** Build structured properties from detail fields */
function buildProperties(detail: SandboxDetail): KnowledgeProperty[] {
  const props: KnowledgeProperty[] = [];
  const rawType = (detail as any).type || '';

  // Environment (operators, dots)
  if ('environment' in detail && detail.environment) {
    const env = detail.environment as Record<string, unknown>;
    for (const [k, v] of Object.entries(env)) {
      if (v !== null && v !== undefined && k !== 'projectId' && k !== 'taskId') {
        props.push({
          key: k,
          value: typeof v === 'object' ? JSON.stringify(v) : String(v),
          group: 'Environment',
          type: typeof v === 'object' ? 'json' : 'text',
        });
      }
    }
  }

  // Input schema
  if ('input' in detail && detail.input) {
    const input = detail.input as Record<string, unknown>;
    for (const [k, v] of Object.entries(input)) {
      if (v !== null && v !== undefined) {
        props.push({
          key: k,
          value: typeof v === 'object' ? JSON.stringify(v) : String(v),
          group: 'Input',
          type: typeof v === 'object' ? 'json' : 'text',
        });
      }
    }
  }

  // Output schema
  if ('output' in detail && detail.output) {
    const output = detail.output as Record<string, unknown>;
    for (const [k, v] of Object.entries(output)) {
      if (v !== null && v !== undefined) {
        props.push({
          key: k,
          value: typeof v === 'object' ? JSON.stringify(v) : String(v),
          group: 'Output',
          type: typeof v === 'object' ? 'json' : 'text',
        });
      }
    }
  }

  // Property (operators)
  if ('property' in detail && detail.property) {
    const prop = detail.property as Record<string, unknown>;
    for (const [k, v] of Object.entries(prop)) {
      if (v !== null && v !== undefined) {
        props.push({
          key: k,
          value: typeof v === 'object' ? JSON.stringify(v) : String(v),
          group: 'Property',
          type: typeof v === 'object' ? 'json' : 'text',
        });
      }
    }
  }

  // Format raw properties through formatter
  return formatProperties(props);
}

/** Clean up tags — strip empty, IDs, generic labels */
function buildTags(detail: SandboxDetail): string[] {
  const raw = detail.tags || [];
  const cleaned = raw
    .filter((t) => t && typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim())
    .filter((t) => !/^[0-9a-f]{8,}$/i.test(t))        // filter pure hex strings
    .filter((t) => !/^[0-9a-f-]{36}$/i.test(t))        // filter UUIDs
    .filter((t) => t.length <= 50);                     // filter overly long

  return [...new Set(cleaned)];
}

/** Build attachments list */
function buildAttachments(detail: SandboxDetail): KnowledgeAttachment[] {
  // Sandbox doesn't currently expose file attachments in detail responses.
  // Future: parse references[] for file:// URIs, or call a separate attachments API.
  return [];
}

/**
 * Parse raw Sandbox detail into a unified KnowledgeDocument.
 * This is the main entry point — all downstream consumers call this.
 */
export function parseSandboxDetail(
  detail: SandboxDetail,
  projectName?: string,
): KnowledgeDocument {
  const rawType = (detail as any).type || 'asset';
  const knowledgeType = mapType(rawType);

  // Resolve references (citations, related datasets, etc.)
  const resolvedRefs = resolveReferences(detail, projectName);

  const doc: KnowledgeDocument = {
    id: `sandbox:${detail.id}`,
    title: detail.name || detail.title || detail.originalName || `Sandbox ${detail.id}`,
    type: knowledgeType,
    abstract: buildAbstract(detail),
    body: buildBody(detail),
    properties: buildProperties(detail),
    references: resolvedRefs,
    attachments: buildAttachments(detail),
    tags: buildTags(detail),
    metadata: {
      source: 'sandbox',
      sourceId: detail.id,
      sourceType: rawType,
      projectName,
      unresolvedIds: resolvedRefs
        .filter((r) => r.type === 'other' && r.target?.startsWith('unresolved:'))
        .map((r) => r.target!.replace('unresolved:', '')),
      rawKeys: Object.keys(detail),
    },
    updatedAt: detail.updateTime || '',
    author: detail.author,
  };

  return doc;
}

/** Bulk parse — maps over an array of Sandbox details */
export function parseBatch(
  details: SandboxDetail[],
  projectName?: string,
): KnowledgeDocument[] {
  return details.map((d) => parseSandboxDetail(d, projectName));
}
