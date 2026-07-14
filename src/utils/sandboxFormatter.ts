// sandboxFormatter — converts raw Sandbox JSON into clean ViewModels.
// Never expose Sandbox raw shapes to React components.
// If Sandbox API changes, only this file needs updating.

import type {
  RecordCardViewModel, ReferenceViewModel, KeyValuePair,
  ImageViewModel, TableViewModel,
} from '../types/viewModels';

// ---- Public API ----

/** Parse raw Sandbox detail into record cards for UI rendering */
export function parseSandboxRecords(raw: unknown): RecordCardViewModel[] {
  if (!raw || typeof raw !== 'object') return [];

  const obj = raw as Record<string, unknown>;
  const records: RecordCardViewModel[] = [];

  // Handle Sandbox dataset detail: datarecords[]
  if (Array.isArray(obj.datarecords)) {
    return (obj.datarecords as Record<string, unknown>[])
      .map((rec, i) => parseOneRecord(rec, i))
      .filter((r) => r.properties.length > 0 || r.description);
  }

  // Handle single Sandbox detail (operator, dot) as one record
  const single = parseOneRecord(obj, 0);
  if (single.properties.length > 0 || single.description) {
    return [single];
  }

  // Handle nested records in metadata or content
  if (Array.isArray(obj.records)) {
    return (obj.records as Record<string, unknown>[])
      .map((rec, i) => parseOneRecord(rec, i))
      .filter((r) => r.properties.length > 0 || r.description);
  }

  return records;
}

/** Extract clean references from Sandbox data */
export function parseSandboxReferences(raw: unknown): ReferenceViewModel[] {
  if (!raw || typeof raw !== 'object') return [];

  const obj = raw as Record<string, unknown>;
  const refs: ReferenceViewModel[] = [];
  let idx = 0;

  // references[] field (operators, dots)
  if (Array.isArray(obj.references)) {
    for (const r of obj.references) {
      if (typeof r === 'string' && r.trim()) {
        refs.push(buildReference(r.trim(), idx++));
      }
    }
  }

  // metadata.references
  const meta = obj.metadata as Record<string, unknown> | undefined;
  if (meta?.references && Array.isArray(meta.references)) {
    for (const r of meta.references) {
      if (typeof r === 'string' && r.trim() && !refs.some((x) => x.label === r)) {
        refs.push(buildReference(r.trim(), idx++));
      }
    }
  }

  // Deep-extract refs from datarecords
  if (Array.isArray(obj.datarecords)) {
    for (const rec of obj.datarecords as Record<string, unknown>[]) {
      if (Array.isArray(rec.references)) {
        for (const r of rec.references) {
          const label = typeof r === 'string' ? r : (r as any)?.label || (r as any)?.doi || String(r);
          if (label.trim() && !refs.some((x) => x.label === label)) {
            refs.push(buildReference(label.trim(), idx++));
          }
        }
      }
    }
  }

  return refs;
}

/** Extract clean tags (never raw objects) */
export function parseSandboxTags(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];

  const obj = raw as Record<string, unknown>;
  const tags: string[] = [];

  // tags field
  if (Array.isArray(obj.tags)) {
    for (const t of obj.tags) {
      if (typeof t === 'string') {
        const clean = t.trim();
        if (clean && clean.length <= 50 && !isMachineId(clean)) tags.push(clean);
      } else if (t && typeof t === 'object') {
        // Handle {id, name} or {label, value} tag shapes
        const tagObj = t as Record<string, unknown>;
        const name = tagObj.name || tagObj.label || tagObj.title || tagObj.value;
        if (typeof name === 'string' && name.trim()) tags.push(name.trim());
      }
    }
  }

  // keywords / categories
  for (const key of ['keywords', 'categories', 'subjects']) {
    if (Array.isArray((obj as any)[key])) {
      for (const item of (obj as any)[key]) {
        if (typeof item === 'string' && item.trim()) tags.push(item.trim());
      }
    }
  }

  return [...new Set(tags.filter(Boolean))];
}

/** Extract images from Sandbox data */
export function parseSandboxImages(raw: unknown): ImageViewModel[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  const images: ImageViewModel[] = [];

  // Direct image/url fields
  for (const key of ['image', 'figure', 'imageUrl', 'figureUrl', 'thumbnail']) {
    const val = obj[key];
    if (typeof val === 'string' && /^https?:\/\//.test(val)) {
      images.push({ url: val, caption: obj.caption as string || obj.title as string });
    }
  }

  // images[] array
  if (Array.isArray(obj.images)) {
    for (const img of obj.images) {
      if (typeof img === 'string' && /^https?:\/\//.test(img)) {
        images.push({ url: img });
      } else if (img && typeof img === 'object') {
        const i = img as Record<string, unknown>;
        const url = i.url || i.src || i.path || i.link;
        if (typeof url === 'string' && url) {
          images.push({
            url,
            caption: (i.caption || i.title || i.description) as string | undefined,
            width: i.width as number | undefined,
            height: i.height as number | undefined,
          });
        }
      }
    }
  }

  // Deep-extract from datarecords
  if (Array.isArray(obj.datarecords)) {
    for (const rec of obj.datarecords as Record<string, unknown>[]) {
      if (Array.isArray(rec.images)) {
        for (const img of rec.images) {
          if (typeof img === 'string') images.push({ url: img });
          else if (img && typeof img === 'object') {
            const i = img as Record<string, unknown>;
            images.push({ url: (i.url || i.src || '') as string, caption: i.caption as string });
          }
        }
      }
    }
  }

  return images;
}

// ---- Internal ----

function parseOneRecord(raw: Record<string, unknown>, index: number): RecordCardViewModel {
  const properties: KeyValuePair[] = [];
  const recordRefs: ReferenceViewModel[] = [];

  // Known semantic fields that should be rendered as properties
  const semanticKeys = [
    'domain', 'adsorbate', 'adsorbent', 'selectivity', 'temperature',
    'pressure', 'gas', 'solvent', 'method', 'technique', 'instrument',
    'formula', 'composition', 'structure', 'surface_area', 'pore_volume',
    'capacity', 'efficiency', 'yield', 'conversion', 'condition',
    'status', 'result', 'conclusion', 'sample', 'preparation',
    'heat', 'enthalpy', 'entropy', 'energy', 'barrier',
  ];

  for (const key of semanticKeys) {
    const val = raw[key];
    if (val !== undefined && val !== null && val !== '') {
      const str = safeStringify(val);
      if (str && !isMachineId(str)) {
        properties.push({ key: humanize(key), value: str });
      }
    }
  }

  // Remaining keys (not in semanticKeys and not internal)
  const internalKeys = new Set([
    'id', '_id', 'projectId', 'taskId', 'datasetId', 'authorId',
    'createdAt', 'updatedAt', '__v', 'tags', 'references', 'images',
    'datarecords', 'metadata', 'type', 'name', 'title', 'description',
    ...semanticKeys,
  ]);

  for (const [key, val] of Object.entries(raw)) {
    if (internalKeys.has(key)) continue;
    if (val === null || val === undefined || val === '') continue;
    const str = safeStringify(val);
    if (str && !isMachineId(str)) {
      properties.push({ key: humanize(key), value: str });
    }
  }

  // Extract refs from this record
  if (Array.isArray(raw.references)) {
    for (const r of raw.references) {
      if (typeof r === 'string') recordRefs.push(buildReference(r, recordRefs.length));
    }
  }

  // Extract images
  const images: ImageViewModel[] = [];
  if (Array.isArray(raw.images)) {
    for (const img of raw.images) {
      if (typeof img === 'string' && /^https?:\/\//.test(img)) images.push({ url: img });
      else if (img && typeof img === 'object') {
        const i = img as Record<string, unknown>;
        images.push({ url: (i.url || i.src || '') as string, caption: i.caption as string });
      }
    }
  }

  return {
    index: index + 1,
    title: (raw.title as string) || (raw.name as string) || `Record ${index + 1}`,
    domain: raw.domain as string | undefined,
    description: raw.description as string | undefined,
    properties,
    references: recordRefs,
    images,
    tables: [],
  };
}

function buildReference(raw: string, index: number): ReferenceViewModel {
  const type = detectRefType(raw);
  return { index: index + 1, label: raw, type, doi: type === 'citation' ? extractDOI(raw) : undefined };
}

function detectRefType(val: string): ReferenceViewModel['type'] {
  if (/^https?:\/\//.test(val)) return 'link';
  if (/\.(pdf|docx?|md|csv|json|xml)$/i.test(val)) return 'file';
  if (/doi/i.test(val) || /10\.\d{4,}/.test(val)) return 'citation';
  return 'document';
}

function extractDOI(raw: string): string | undefined {
  const m = raw.match(/10\.\d{4,}\/[\w.\-]+/);
  return m ? m[0] : undefined;
}

// ---- Safe formatting helpers ----

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string')) return value.join(', ');
    if (value.length <= 5 && value.every((v) => typeof v === 'number')) return value.join(', ');
    return JSON.stringify(value.slice(0, 3));
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value, null, 0); } catch { return ''; }
  }
  return String(value);
}

function isMachineId(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
      || /^[0-9a-f]{24}$/i.test(str);
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
