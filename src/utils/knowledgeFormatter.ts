// knowledgeFormatter — converts WikiEntry + backend data → DetailViewModel.
// This is the SINGLE entry point for detail page data normalization.
// No component should directly read raw entry fields without going through this.

import type { WikiEntry, Reference } from '../types/wiki';
import type {
  DetailViewModel, MetadataSection, KeyValuePair,
  RecordCardViewModel, ReferenceViewModel, AttachmentViewModel,
} from '../types/viewModels';
import { parseSandboxRecords, parseSandboxReferences, parseSandboxTags, parseSandboxImages } from './sandboxFormatter';

/** Main entry point — builds DetailViewModel from raw entry + any extra data */
export function toDetailViewModel(
  entry: WikiEntry | any,
  extra?: {
    sandboxRaw?: unknown;
    dataItems?: any[];
    files?: any[];
  },
): DetailViewModel {
  return {
    id: String(entry.id || ''),
    title: sanitizeTitle(entry.title),
    entryType: entry.entryType || entry.type || 'general',
    author: entry.owner || entry.author || '未知',
    updatedAt: entry.latestUpdatedAt || entry.updatedAt || entry.updated_at || '',
    createdAt: entry.createdAt || entry.created_at || '',
    visibility: entry.visibility || 'internal',
    metadata: buildMetadata(entry, extra),
    summary: entry.summary || '',
    content: entry.content || '',
    tags: cleanTags(entry.tags),
    records: buildRecords(entry, extra),
    references: buildReferences(entry, extra),
    attachments: buildAttachments(extra?.files || []),
    sandboxRaw: extra?.sandboxRaw,
  };
}

/** Clean and normalize tags — never return [object Object] */
export function cleanTags(raw: unknown): string[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map((t: unknown) => {
      if (typeof t === 'string') return t.trim();
      if (t && typeof t === 'object') {
        const obj = t as Record<string, unknown>;
        return String(obj.name || obj.label || obj.title || obj.value || '');
      }
      return '';
    })
    .filter((t: string) => t.length > 0 && t.length <= 50 && !/^[0-9a-f]{8,}$/i.test(t));
}

// ---- Internal builders ----

function sanitizeTitle(raw: string): string {
  if (!raw) return '(未命名)';
  return raw
    .replace(/\x00/g, '')
    .replace(/[\uD800-\uDFFF]/g, '�')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .slice(0, 500);
}

function buildMetadata(entry: any, extra?: any): MetadataSection {
  const items: KeyValuePair[] = [];

  if (entry.entryType) items.push({ key: '类型', value: entry.entryType });
  if (entry.visibility) items.push({ key: '可见度', value: entry.visibility });
  if (entry.owner) items.push({ key: '责任专家', value: entry.owner });
  if (entry.ownerDepartment) items.push({ key: '所属科室', value: entry.ownerDepartment });
  if (entry.latestUpdatedAt) items.push({ key: '最近更新', value: entry.latestUpdatedAt });
  if (entry.createdAt) items.push({ key: '创建时间', value: entry.createdAt });
  if (entry.entryVersion) items.push({ key: '版本', value: entry.entryVersion, type: 'code' });
  if (entry.isStableVersion) items.push({ key: '状态', value: '✅ 稳定版', type: 'badge' });

  return { items };
}

function buildRecords(entry: any, extra?: any): RecordCardViewModel[] {
  // Priority 1: Sandbox data from extra
  if (extra?.sandboxRaw) {
    const records = parseSandboxRecords(extra.sandboxRaw);
    if (records.length > 0) return records;
  }

  // Priority 2: Entry content might contain sandbox JSON
  if (entry.content && typeof entry.content === 'string' && entry.content.includes('"datarecords"')) {
    try {
      const parsed = JSON.parse(entry.content);
      const records = parseSandboxRecords(parsed);
      if (records.length > 0) return records;
    } catch { /* not JSON */ }
  }

  // Priority 3: Data items as records
  if (extra?.dataItems && Array.isArray(extra.dataItems)) {
    return extra.dataItems.map((di: any, i: number) => ({
      index: i + 1,
      title: di.dataName || `Data Item ${i + 1}`,
      description: di.dataDefinition,
      properties: [
        { key: '数据格式', value: di.dataFormat || '—' },
        { key: 'Schema 版本', value: di.schemaVersion || '—' },
        { key: '负责人', value: di.responsiblePerson || '—' },
        { key: '更新时间', value: di.latestUpdatedAt || di.updatedAt || '—' },
      ],
      references: [],
      images: [],
      tables: [],
    }));
  }

  return [];
}

function buildReferences(entry: any, extra?: any): ReferenceViewModel[] {
  const refs: ReferenceViewModel[] = [];

  // From Sandbox raw
  if (extra?.sandboxRaw) {
    refs.push(...parseSandboxReferences(extra.sandboxRaw));
  }

  // From entry content (parse references inline)
  if (entry.content && typeof entry.content === 'string') {
    // Extract DOI patterns
    const dois = entry.content.matchAll(/10\.\d{4,}\/[\w.\-]+/g);
    for (const m of dois) {
      if (!refs.some((r) => r.doi === m[0])) {
        refs.push({ index: refs.length + 1, label: m[0], doi: m[0], type: 'citation' });
      }
    }
  }

  return refs;
}

function buildAttachments(files: any[]): AttachmentViewModel[] {
  return files.map((f: any) => ({
    name: f.originalFilename || f.original_filename || f.name || 'unknown',
    url: f.storagePath || f.storage_path || f.url,
    mimeType: f.fileType || f.file_type || f.mimeType,
    size: f.fileSize ? String(f.fileSize) : undefined,
  }));
}
