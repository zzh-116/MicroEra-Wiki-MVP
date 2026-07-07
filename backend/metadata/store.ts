import fs from 'node:fs';
import path from 'node:path';
import { Entry, Category, Tag, WikiFile, DataItem, EntryType, VisibilityType } from '../types.js';
import { config } from '../config.js';

const DATA_DIR = path.resolve(config.dataDir, 'metadata');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadFile<T>(name: string, fallback: T): T {
  ensureDir();
  const fp = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function saveFile<T>(name: string, data: T): void {
  ensureDir();
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8');
}

function nextId<T extends { id: number }>(arr: T[]): number {
  return arr.length === 0 ? 1 : Math.max(...arr.map((x) => x.id)) + 1;
}

/** Seed initial data from inline defaults */
export function seedMetadata(): void {
  if (loadFile<any[]>('entries', []).length > 0) return; // already seeded

  saveFile('categories', [
    { id: 1, name: '展示素材', description: '展示素材与图解', sort_order: 1 },
    { id: 2, name: '产品资料', description: '产品与业务文档', sort_order: 2 },
    { id: 3, name: '技术能力', description: '技术研发与能力说明', sort_order: 3 },
    { id: 4, name: '专利成果', description: '学术与专利成果', sort_order: 4 },
    { id: 5, name: '数据条目', description: '研发数据对齐条目', sort_order: 5 },
    { id: 6, name: '研发协作', description: '研发协作与技术交流', sort_order: 6 },
  ]);

  saveFile('tags', [
    { id: 1, name: '可对外' }, { id: 2, name: '内部资料' }, { id: 3, name: 'PPT素材' },
    { id: 4, name: '宣发素材' }, { id: 5, name: '产品图片' }, { id: 6, name: '流程图' },
    { id: 7, name: '厂房照片' }, { id: 8, name: '数据格式' }, { id: 9, name: '数据库架构' },
    { id: 10, name: '技术优势' }, { id: 11, name: '客户展示' }, { id: 12, name: '研发协作' },
    { id: 13, name: '产品介绍' }, { id: 14, name: '材料计算' }, { id: 15, name: 'AI' },
    { id: 16, name: '实验数据' }, { id: 17, name: '专利成果' }, { id: 18, name: '技术成果' },
    { id: 19, name: '材料性质' }, { id: 20, name: '元数据' }, { id: 21, name: 'DFT' },
    { id: 22, name: '吸附分离' }, { id: 23, name: '传感' }, { id: 24, name: '催化' },
    { id: 25, name: 'MOF' }, { id: 26, name: 'COF' },
  ]);

  saveFile('entries', [
    {
      id: 1, title: '量子计算材料设计平台', entry_type: 'product',
      summary: '面向客户展示公司核心材料计算 SaaS 平台的高层级分析流程和客户案例。',
      content: '## 产品定位\n\n本平台致力于推进量子材料与超分子结构的计算设计。\n\n### 核心特性\n\n- 高通量材料带隙逆向搜索\n- 基于图神经网络（GNN）实现分子性质多层级预测\n- DFT 算力自动化排班与交付系统\n- 晶体空间群自动标定算法\n\n### 客户案例\n\n已成功为多家半导体企业完成材料电场模拟、催化筛选与超硬膜层性能预演。',
      visibility: 'public', category_id: 2,
      created_at: '2026-06-10T01:20:00.000Z', updated_at: '2026-06-22T09:10:00.000Z',
      tags: ['产品介绍', '客户展示', '材料计算'],
    },
    {
      id: 2, title: 'AI 驱动的实验数据分析能力', entry_type: 'tech',
      summary: '企业自主研发的端到端实验数据仓库和基于大语言模型的智能分析引擎。',
      content: '## 技术架构\n\n实验数据通过统一 schema 写入数据湖，经由多模态大模型实现智能推荐与特征提取。\n\n### 技术栈\n\n- 自研数据清洗流水线\n- 多模态大模型（视觉+文本）\n- 自动化异常检测与根因分析\n\n### 性能指标\n\n- 数据吞吐：50GB/h\n- 分析精度：准确率 92%+',
      visibility: 'public', category_id: 3,
      created_at: '2026-06-10T02:00:00.000Z', updated_at: '2026-06-21T15:30:00.000Z',
      tags: ['技术优势', 'AI', '实验数据'],
    },
    {
      id: 3, title: '某某智能计算方法专利', entry_type: 'patent',
      summary: '面向高通量材料筛选的智能计算方法和系统发明专利简介。',
      content: '## 专利概况\n\n- 专利号：CN2026XXXXXX.X\n- 申请日：2026-03-15\n\n### 技术要点\n\n基于特征强化大模型的可迁移材料性质预测系统。',
      visibility: 'public', category_id: 4,
      created_at: '2026-06-10T03:30:00.000Z', updated_at: '2026-06-20T10:00:00.000Z',
      tags: ['专利成果', '技术成果', '客户展示'],
    },
    {
      id: 4, title: '公司业务流程图', entry_type: 'asset',
      summary: '完整业务流程图（商务对接 → 算力排班 → 交付归档）。',
      content: '内部素材。',
      visibility: 'internal', category_id: 1,
      created_at: '2026-06-11T09:00:00.000Z', updated_at: '2026-06-19T14:00:00.000Z',
      tags: ['PPT素材', '流程图', '内部资料'],
    },
    {
      id: 5, title: '产品效果图 A', entry_type: 'asset',
      summary: '材料计算平台 UI 效果图。',
      content: '内部宣发素材。',
      visibility: 'internal', category_id: 1,
      created_at: '2026-06-12T11:00:00.000Z', updated_at: '2026-06-18T16:00:00.000Z',
      tags: ['产品图片', '宣发素材', '内部资料'],
    },
    {
      id: 6, title: '实地厂房照片', entry_type: 'asset',
      summary: '研发中心与 HPC 机房实拍。',
      content: '公司介绍用素材。',
      visibility: 'internal', category_id: 1,
      created_at: '2026-06-13T08:00:00.000Z', updated_at: '2026-06-17T09:00:00.000Z',
      tags: ['厂房照片', '宣发素材', '内部资料'],
    },
    {
      id: 7, title: '材料结构数据条目', entry_type: 'data_item',
      summary: '晶体结构与分子材料核心研发数据字段对齐元数据。',
      content: '晶体结构数据标准化 schema 定义。',
      visibility: 'internal', category_id: 5,
      created_at: '2026-06-14T10:00:00.000Z', updated_at: '2026-06-16T11:00:00.000Z',
      tags: ['数据格式', '数据库架构', '研发协作'],
    },
    {
      id: 8, title: '实验数据存储结构说明', entry_type: 'data_item',
      summary: '实验室表征数据 SQL 存储 schema 与维护人信息。',
      content: '实验数据存储结构说明文档。',
      visibility: 'internal', category_id: 5,
      created_at: '2026-06-15T07:00:00.000Z', updated_at: '2026-06-15T12:00:00.000Z',
      tags: ['数据库架构', '实验数据', '研发协作'],
    },
  ]);

  saveFile('files', []);
  saveFile('data_items', []);
}

export class MetadataStore {
  // ---- Entries ----
  getEntries(params?: {
    keyword?: string;
    entry_type?: string;
    visibility?: string;
    category_id?: string;
    tag?: string;
  }, isInternal = false): Entry[] {
    let entries = loadFile<Entry[]>('entries', []);

    if (!isInternal) {
      entries = entries.filter((e) => e.visibility === 'public');
    }

    if (params) {
      if (params.keyword) {
        const kw = params.keyword.toLowerCase();
        entries = entries.filter(
          (e) => e.title.toLowerCase().includes(kw) || e.summary.toLowerCase().includes(kw) || e.content.toLowerCase().includes(kw)
        );
      }
      if (params.entry_type && params.entry_type !== 'all') entries = entries.filter((e) => e.entry_type === params.entry_type);
      if (params.visibility && params.visibility !== 'all') entries = entries.filter((e) => e.visibility === params.visibility);
      if (params.category_id && params.category_id !== 'all') entries = entries.filter((e) => e.category_id === Number(params.category_id));
      if (params.tag) entries = entries.filter((e) => e.tags.includes(params.tag));
    }

    return entries.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  getEntryById(id: number): Entry | undefined {
    return loadFile<Entry[]>('entries', []).find((e) => e.id === id);
  }

  getEntriesByIds(ids: number[]): Entry[] {
    const entries = loadFile<Entry[]>('entries', []);
    const map = new Map(entries.map((e) => [e.id, e]));
    return ids.map((id) => map.get(id)).filter(Boolean) as Entry[];
  }

  createEntry(input: Omit<Entry, 'id' | 'created_at' | 'updated_at'>): Entry {
    const entries = loadFile<Entry[]>('entries', []);
    const now = new Date().toISOString();
    const entry: Entry = { id: nextId(entries), ...input, created_at: now, updated_at: now };
    entries.push(entry);
    saveFile('entries', entries);
    this.syncTags(entry.tags);
    return entry;
  }

  updateEntry(id: number, input: Partial<Entry>): Entry {
    const entries = loadFile<Entry[]>('entries', []);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('ENTRY_NOT_FOUND');
    entries[idx] = { ...entries[idx], ...input, id, updated_at: new Date().toISOString() };
    saveFile('entries', entries);
    this.syncTags(entries[idx].tags);
    return entries[idx];
  }

  deleteEntry(id: number): void {
    let entries = loadFile<Entry[]>('entries', []);
    entries = entries.filter((e) => e.id !== id);
    saveFile('entries', entries);
    // Cascade
    saveFile('files', loadFile<WikiFile[]>('files', []).filter((f) => f.entry_id !== id));
    saveFile('data_items', loadFile<DataItem[]>('data_items', []).filter((d) => d.entry_id !== id));
  }

  // ---- Categories ----
  getCategories(): Category[] {
    return loadFile<Category[]>('categories', []).sort((a, b) => a.sort_order - b.sort_order);
  }

  // ---- Tags ----
  getTags(): Tag[] {
    return loadFile<Tag[]>('tags', []);
  }

  syncTags(tagNames: string[]): void {
    if (!tagNames.length) return;
    const tags = loadFile<Tag[]>('tags', []);
    const existing = new Set(tags.map((t) => t.name.toLowerCase()));
    for (const name of tagNames) {
      if (!existing.has(name.toLowerCase())) {
        tags.push({ id: nextId(tags), name });
        existing.add(name.toLowerCase());
      }
    }
    saveFile('tags', tags);
  }

  // ---- Files ----
  getFiles(entryId?: number, isInternal = false): WikiFile[] {
    let files = loadFile<WikiFile[]>('files', []);
    if (!isInternal) {
      const publicIds = new Set(this.getEntries({}, false).map((e) => e.id));
      files = files.filter((f) => publicIds.has(f.entry_id));
    }
    if (entryId) files = files.filter((f) => f.entry_id === entryId);
    return files;
  }

  createFile(input: { name: string; size: number; type: string; entryId: number; usageType: string }): WikiFile {
    const files = loadFile<WikiFile[]>('files', []);
    const stored = Math.random().toString(36).substring(2, 10);
    const file: WikiFile = {
      id: nextId(files),
      entry_id: input.entryId,
      original_filename: input.name,
      stored_filename: stored,
      file_type: input.type,
      file_size: input.size,
      storage_path: `/uploads/images/${stored}`,
      usage_type: input.usageType,
      created_at: new Date().toISOString(),
    };
    files.push(file);
    saveFile('files', files);
    return file;
  }

  deleteFile(id: number): void {
    saveFile('files', loadFile<WikiFile[]>('files', []).filter((f) => f.id !== id));
  }

  // ---- DataItems ----
  getDataItems(): DataItem[] {
    return loadFile<DataItem[]>('data_items', []);
  }

  getDataItemByEntryId(entryId: number): DataItem | undefined {
    return loadFile<DataItem[]>('data_items', []).find((d) => d.entry_id === entryId);
  }

  saveDataItem(input: Omit<DataItem, 'id' | 'updated_at'> & { id?: number }): DataItem {
    const items = loadFile<DataItem[]>('data_items', []);
    const today = new Date().toISOString().split('T')[0];
    let idx = -1;
    if (input.id) idx = items.findIndex((d) => d.id === input.id);
    else idx = items.findIndex((d) => d.entry_id === input.entry_id);

    if (idx >= 0) {
      items[idx] = { ...items[idx], ...input, updated_at: today };
      saveFile('data_items', items);
      return items[idx];
    }
    const item: DataItem = { id: nextId(items), ...input, updated_at: today };
    items.push(item);
    saveFile('data_items', items);
    return item;
  }

  deleteDataItem(id: number): void {
    saveFile('data_items', loadFile<DataItem[]>('data_items', []).filter((d) => d.id !== id));
  }
}

export const metadataStore = new MetadataStore();
