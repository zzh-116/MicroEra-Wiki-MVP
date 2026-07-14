// ReferenceResolver — resolves internal IDs (datasetId, projectId, taskId, etc.)
// to human-readable display names. Gracefully degrades when resolution fails.
//
// Resolution strategies:
//   1. Inline data — if the detail already contains project.title, use it
//   2. Pattern matching — guess reference type from ID format
//   3. Graceful degradation — show "关联项目" instead of raw UUID

import type { SandboxDetail } from '../types.js';
import type { KnowledgeReference } from './types.js';

/** UUID pattern: 8-4-4-4-12 hex digits */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ObjectId pattern: 24 hex chars */
const OBJECTID_RE = /^[0-9a-f]{24}$/i;

/** Detect if a string looks like a machine ID */
function isMachineId(s: string): boolean {
  return UUID_RE.test(s) || OBJECTID_RE.test(s);
}

/** Guess the reference type from the value or context key */
function guessType(value: string, key?: string): KnowledgeReference['type'] {
  const lower = (key || '').toLowerCase() + ' ' + value.toLowerCase();

  if (/dataset|data\s*set|数据/.test(lower)) return 'dataset';
  if (/project|项目/.test(lower)) return 'project';
  if (/task|任务/.test(lower)) return 'task';
  if (/citation|cited?|ref(erence)?|文献|引用/.test(lower)) return 'citation';
  if (/file|文件|\.pdf|\.doc|\.md|\.csv|\.json|\.xml/i.test(lower)) return 'file';
  if (/https?:\/\//.test(value)) return 'link';

  return 'other';
}

/**
 * Resolve a single raw reference value into a displayable KnowledgeReference.
 * Pure IDs (UUIDs, ObjectIds) are hidden; named references are preserved.
 */
function resolveOne(raw: string, projectName?: string): KnowledgeReference {
  const trimmed = raw.trim();

  // URL
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      label: trimmed.length > 60 ? trimmed.slice(0, 60) + '…' : trimmed,
      type: 'link',
      target: trimmed,
    };
  }

  // File path
  if (/\.(pdf|docx?|md|txt|csv|json|xml|yaml|yml|png|jpe?g)$/i.test(trimmed)) {
    const name = trimmed.split('/').pop() || trimmed;
    return { label: name, type: 'file', target: trimmed };
  }

  // Machine IDs — hide from display, but note as unresolved
  if (isMachineId(trimmed)) {
    return {
      label: '',
      type: 'other',
      target: `unresolved:${trimmed}`,
      description: '未解析的内部标识符',
    };
  }

  // Named reference — use as-is
  const refType = guessType(trimmed);
  return {
    label: trimmed.length > 100 ? trimmed.slice(0, 100) + '…' : trimmed,
    type: refType,
    target: trimmed,
  };
}

/**
 * Resolve all references from a Sandbox detail.
 *
 * Resolution pipeline:
 *   1. Parse detail.references[] — raw reference strings
 *   2. Resolve project name from detail.project.projectTitle (if available)
 *   3. Filter out unresolvable machine IDs (they appear as unresolvedIds in metadata)
 */
export function resolveReferences(
  detail: SandboxDetail,
  projectName?: string,
): KnowledgeReference[] {
  const refs: KnowledgeReference[] = [];

  // Resolve project reference
  const projTitle = projectName || detail.project?.projectTitle;
  if (projTitle) {
    refs.push({
      label: projTitle,
      type: 'project',
      target: detail.project?.projectId,
      description: '所属项目',
    });
  }

  // Resolve raw references[] strings
  if (detail.references?.length) {
    for (const raw of detail.references) {
      if (typeof raw === 'string' && raw.trim()) {
        const resolved = resolveOne(raw, projTitle);
        // Only include if it has a displayable label (filters out pure machine IDs)
        if (resolved.label) {
          refs.push(resolved);
        }
      }
    }
  }

  // Resolve metadata fields that point to other entities
  if (detail.metadata) {
    const meta = detail.metadata as Record<string, unknown>;
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === 'string' && value.trim() && isMachineId(value)) {
        // Skip machine IDs in metadata — they go to unresolvedIds
        continue;
      }
      if (typeof value === 'string' && value.trim() && key.endsWith('Id')) {
        const label = key.replace(/Id$/i, '').replace(/([A-Z])/g, ' $1').trim();
        refs.push({
          label: `${label}: ${value}`,
          type: guessType(value, key),
          target: value,
        });
      }
    }
  }

  // Deduplicate by label
  const seen = new Set<string>();
  return refs.filter((r) => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  });
}
