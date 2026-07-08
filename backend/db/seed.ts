// Seed database with initial data (admin user, categories, tags, entries)
// Idempotent — skips if already seeded
import { db } from './connection.js';
import {
  categories, tags, entries, entryTags,
  wikiFiles, dataItems, documentChunks, vectors,
} from './schema.js';
import { sql, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { users } from './schema.js';

const SEED_CATEGORIES = [
  { id: 1, name: '展示素材', description: '展示素材与图解', sortOrder: 1 },
  { id: 2, name: '产品资料', description: '产品与业务文档', sortOrder: 2 },
  { id: 3, name: '技术能力', description: '技术研发与能力说明', sortOrder: 3 },
  { id: 4, name: '专利成果', description: '学术与专利成果', sortOrder: 4 },
  { id: 5, name: '数据条目', description: '研发数据对齐条目', sortOrder: 5 },
  { id: 6, name: '研发协作', description: '研发协作与技术交流', sortOrder: 6 },
];

const SEED_TAGS = [
  { id: 1, name: '可对外' }, { id: 2, name: '内部资料' }, { id: 3, name: 'PPT素材' },
  { id: 4, name: '宣发素材' }, { id: 5, name: '产品图片' }, { id: 6, name: '流程图' },
  { id: 7, name: '厂房照片' }, { id: 8, name: '数据格式' }, { id: 9, name: '数据库架构' },
  { id: 10, name: '技术优势' }, { id: 11, name: '客户展示' }, { id: 12, name: '研发协作' },
  { id: 13, name: '产品介绍' }, { id: 14, name: '材料计算' }, { id: 15, name: 'AI' },
  { id: 16, name: '实验数据' }, { id: 17, name: '专利成果' }, { id: 18, name: '技术成果' },
  { id: 19, name: '材料性质' }, { id: 20, name: '元数据' }, { id: 21, name: 'DFT' },
  { id: 22, name: '吸附分离' }, { id: 23, name: '传感' }, { id: 24, name: '催化' },
  { id: 25, name: 'MOF' }, { id: 26, name: 'COF' },
];

const SEED_ENTRIES = [
  { id: 1, title: '量子计算材料设计平台', entryType: 'product' as const,
    summary: '面向客户展示公司核心材料计算 SaaS 平台的高层级分析流程和客户案例。',
    content: '## 产品定位\n\n本平台致力于推进量子材料与超分子结构的计算设计。\n\n### 核心特性\n\n- 高通量材料带隙逆向搜索\n- 基于图神经网络（GNN）实现分子性质多层级预测\n- DFT 算力自动化排班与交付系统\n- 晶体空间群自动标定算法\n\n### 客户案例\n\n已成功为多家半导体企业完成材料电场模拟、催化筛选与超硬膜层性能预演。',
    visibility: 'public' as const, categoryId: 2,
    createdAt: new Date('2026-06-10T01:20:00Z'), updatedAt: new Date('2026-06-22T09:10:00Z'),
    tags: ['产品介绍', '客户展示', '材料计算'] },
  { id: 2, title: 'AI 驱动的实验数据分析能力', entryType: 'tech' as const,
    summary: '企业自主研发的端到端实验数据仓库和基于大语言模型的智能分析引擎。',
    content: '## 技术架构\n\n实验数据通过统一 schema 写入数据湖，经由多模态大模型实现智能推荐与特征提取。\n\n### 技术栈\n\n- 自研数据清洗流水线\n- 多模态大模型（视觉+文本）\n- 自动化异常检测与根因分析\n\n### 性能指标\n\n- 数据吞吐：50GB/h\n- 分析精度：准确率 92%+',
    visibility: 'public' as const, categoryId: 3,
    createdAt: new Date('2026-06-10T02:00:00Z'), updatedAt: new Date('2026-06-21T15:30:00Z'),
    tags: ['技术优势', 'AI', '实验数据'] },
  { id: 3, title: '某某智能计算方法专利', entryType: 'patent' as const,
    summary: '面向高通量材料筛选的智能计算方法和系统发明专利简介。',
    content: '## 专利概况\n\n- 专利号：CN2026XXXXXX.X\n- 申请日：2026-03-15\n\n### 技术要点\n\n基于特征强化大模型的可迁移材料性质预测系统。',
    visibility: 'public' as const, categoryId: 4,
    createdAt: new Date('2026-06-10T03:30:00Z'), updatedAt: new Date('2026-06-20T10:00:00Z'),
    tags: ['专利成果', '技术成果', '客户展示'] },
  { id: 4, title: '公司业务流程图', entryType: 'asset' as const,
    summary: '完整业务流程图（商务对接 → 算力排班 → 交付归档）。', content: '内部素材。',
    visibility: 'internal' as const, categoryId: 1,
    createdAt: new Date('2026-06-11T09:00:00Z'), updatedAt: new Date('2026-06-19T14:00:00Z'),
    tags: ['PPT素材', '流程图', '内部资料'] },
  { id: 5, title: '产品效果图 A', entryType: 'asset' as const,
    summary: '材料计算平台 UI 效果图。', content: '内部宣发素材。',
    visibility: 'internal' as const, categoryId: 1,
    createdAt: new Date('2026-06-12T11:00:00Z'), updatedAt: new Date('2026-06-18T16:00:00Z'),
    tags: ['产品图片', '宣发素材', '内部资料'] },
  { id: 6, title: '实地厂房照片', entryType: 'asset' as const,
    summary: '研发中心与 HPC 机房实拍。', content: '公司介绍用素材。',
    visibility: 'internal' as const, categoryId: 1,
    createdAt: new Date('2026-06-13T08:00:00Z'), updatedAt: new Date('2026-06-17T09:00:00Z'),
    tags: ['厂房照片', '宣发素材', '内部资料'] },
  { id: 7, title: '材料结构数据条目', entryType: 'data_item' as const,
    summary: '晶体结构与分子材料核心研发数据字段对齐元数据。', content: '晶体结构数据标准化 schema 定义。',
    visibility: 'internal' as const, categoryId: 5,
    createdAt: new Date('2026-06-14T10:00:00Z'), updatedAt: new Date('2026-06-16T11:00:00Z'),
    tags: ['数据格式', '数据库架构', '研发协作'] },
  { id: 8, title: '实验数据存储结构说明', entryType: 'data_item' as const,
    summary: '实验室表征数据 SQL 存储 schema 与维护人信息。', content: '实验数据存储结构说明文档。',
    visibility: 'internal' as const, categoryId: 5,
    createdAt: new Date('2026-06-15T07:00:00Z'), updatedAt: new Date('2026-06-15T12:00:00Z'),
    tags: ['数据库架构', '实验数据', '研发协作'] },
];

async function buildTagMap(): Promise<Map<string, number>> {
  const allTags = await db.select().from(tags);
  return new Map(allTags.map((t) => [t.name, t.id]));
}

export async function seedDatabase(force = false): Promise<void> {
  // Idempotency check
  if (!force) {
    const existing = await db.select({ id: entries.id }).from(entries).limit(1);
    if (existing.length > 0) { console.log('[Seed] Already seeded, skipping'); return; }
  }

  if (force) {
    console.log('[Seed] Force re-seeding...');
    await db.delete(entryTags); await db.delete(vectors);
    await db.delete(documentChunks); await db.delete(dataItems);
    await db.delete(wikiFiles); await db.delete(entries);
    await db.delete(tags); await db.delete(categories);
  }

  // 0. Admin user
  const pwdHash = await bcrypt.hash('admin123', 10);
  await db.insert(users).values({
    username: 'admin', passwordHash: pwdHash,
    displayName: '管理员', role: 'admin',
  }).onConflictDoNothing();
  console.log('[Seed] Admin user: admin / admin123');

  // 1. Categories
  for (const cat of SEED_CATEGORIES) await db.insert(categories).values(cat).onConflictDoNothing();
  // 2. Tags
  for (const tag of SEED_TAGS) await db.insert(tags).values(tag).onConflictDoNothing();
  const tagMap = await buildTagMap();

  // 3. Entries
  for (const entry of SEED_ENTRIES) {
    const { tags: tagNames, ...data } = entry;
    const ex = await db.select({ id: entries.id }).from(entries).where(eq(entries.id, entry.id)).limit(1);
    if (ex.length > 0) continue;

    await db.insert(entries).values(data);
    for (const tagName of tagNames) {
      const tagId = tagMap.get(tagName);
      if (tagId) await db.insert(entryTags).values({ entryId: entry.id, tagId }).onConflictDoNothing();
    }
  }

  // Reset sequences
  await db.execute(sql`SELECT setval('entries_id_seq', 8)`);
  await db.execute(sql`SELECT setval('categories_id_seq', 6)`);
  await db.execute(sql`SELECT setval('tags_id_seq', 26)`);
  console.log('[Seed] Database seeded successfully');
}

const isMain = process.argv[1]?.includes('seed');
if (isMain) {
  seedDatabase(process.argv.includes('--force'))
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch((err) => { console.error('Seed failed:', err); process.exit(1); });
}
