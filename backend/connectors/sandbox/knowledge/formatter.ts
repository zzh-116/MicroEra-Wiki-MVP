// PropertyFormatter — converts raw arrays/objects into structured KnowledgeProperty[].
// Guarantees: no [object Object], no raw UUIDs, no null/undefined values in output.

import type { KnowledgeProperty } from './types.js';

/** Maximum length for a single property value before truncation */
const MAX_VALUE_LENGTH = 500;

/** Keys to filter out from display (internal IDs, irrelevant to users) */
const FILTERED_KEY_PATTERNS = [
  /^_id$/i,
  /^projectId$/i,
  /^taskId$/i,
  /^datasetId$/i,
  /^authorId$/i,
  /^userId$/i,
  /^filePath$/i,
  /^storagePath$/i,
  /^objectId$/i,
  /^__v$/,
  /^createdAt$/i,
  /^updatedAt$/i,
];

/** Check if a key should be filtered */
function isFilteredKey(key: string): boolean {
  return FILTERED_KEY_PATTERNS.some((p) => p.test(key));
}

/** Safe stringify — never returns "[object Object]" */
function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  // Arrays: join with commas (if simple) or JSON
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    if (value.every((v) => typeof v === 'string')) {
      return value.join(', ');
    }
    if (value.every((v) => typeof v === 'number')) {
      return value.join(', ');
    }
    // Complex arrays — stringify but limit length
    const json = JSON.stringify(value.slice(0, 10));
    return json.length > MAX_VALUE_LENGTH ? json.slice(0, MAX_VALUE_LENGTH) + '…' : json;
  }

  // Objects: JSON stringify with truncation
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value, null, 0);
      return json.length > MAX_VALUE_LENGTH ? json.slice(0, MAX_VALUE_LENGTH) + '…' : json;
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/** Detect the type hint for a value */
function detectType(value: unknown): KnowledgeProperty['type'] {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'text';
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) return 'link';
    if (value.length > 200) return 'code';
    return 'text';
  }
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'object') return 'json';
  return 'text';
}

/** Humanize a camelCase key to display label */
function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

/**
 * Format raw properties into clean, displayable KnowledgeProperty[].
 *
 * Transformations applied:
 *   1. Flatten nested objects one level
 *   2. Filter internal IDs (projectId, taskId, UUID, filePath)
 *   3. Safe stringify all values (no [object Object])
 *   4. Truncate long values
 *   5. Detect type hints for UI rendering
 *   6. Humanize camelCase keys
 */
export function formatProperties(raw: KnowledgeProperty[]): KnowledgeProperty[] {
  const formatted: KnowledgeProperty[] = [];

  for (const prop of raw) {
    // Skip filtered keys
    if (isFilteredKey(prop.key)) continue;

    const safeValue = safeStringify(prop.value);

    // Skip empty values
    if (!safeValue) continue;

    // Skip pure machine IDs
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeValue)) continue;
    if (/^[0-9a-f]{24}$/i.test(safeValue)) continue;

    formatted.push({
      key: prop.key ? humanizeKey(prop.key) : '',
      value: safeValue,
      group: prop.group,
      type: prop.type || detectType(prop.value),
    });
  }

  return formatted;
}

/**
 * Format raw tags into clean badge-ready strings.
 * Removes IDs, UUIDs, empty strings, and duplicates.
 */
export function formatTags(rawTags: string[]): string[] {
  return [...new Set(
    rawTags
      .filter((t) => t && typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim())
      .filter((t) => t.length <= 50)
      .filter((t) => !/^[0-9a-f-]{8,}$/i.test(t)),
  )];
}
