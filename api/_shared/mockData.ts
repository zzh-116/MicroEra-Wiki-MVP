// ============================================================
// Types (self-contained — no imports from src/)
// ============================================================

export type EntryType = 'asset' | 'product' | 'tech' | 'patent' | 'data_item';
export type VisibilityType = 'public' | 'internal';
export type UsageType = 'PPT素材' | '宣发素材' | '客户展示' | '研发资料' | '产品资料' | '内部归档';

export interface Entry {
  id: number;
  title: string;
  entry_type: EntryType;
  summary: string;
  content: string;
  visibility: VisibilityType;
  category_id?: number;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  sort_order: number;
}

export interface Tag {
  id: number;
  name: string;
}

export interface WikiFile {
  id: number;
  entry_id: number;
  original_filename: string;
  stored_filename: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  usage_type: UsageType;
  created_at: string;
}

export interface DataItem {
  id: number;
  entry_id: number;
  data_name: string;
  data_definition: string;
  data_format: string;
  storage_description?: string;
  schema_description?: string;
  schema_version: string;
  responsible_person: string;
  updated_at: string;
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at?: string;
}

// ============================================================
// Mock data constants
// ============================================================

const mockCategories: Category[] = [
  { id: 1, name: '展示素材', description: '公司业务流程图、效果图、概念分析图等常用汇报素材', sort_order: 1 },
  { id: 2, name: '产品资料', description: '公司主营业务、产品体系、解决方案与垂直应用方向', sort_order: 2 },
  { id: 3, name: '技术能力', description: '核心技术优势、实验平台、算法能力与科研工作流描述', sort_order: 3 },
  { id: 4, name: '专利成果', description: '已授权/申请中的专利、软件著作权、科研论文等学术成果', sort_order: 4 },
  { id: 5, name: '数据条目', description: '研发团队协作对齐的数据、Schema 架构、数据定义信息', sort_order: 5 },
  { id: 6, name: '研发协作', description: '跨组日常研发、流程与基础接口调用说明', sort_order: 6 },
];

const mockTags: Tag[] = [
  { id: 1, name: '可对外' },
  { id: 2, name: '内部资料' },
  { id: 3, name: 'PPT素材' },
  { id: 4, name: '宣发素材' },
  { id: 5, name: '产品图片' },
  { id: 6, name: '流程图' },
  { id: 7, name: '厂房照片' },
  { id: 8, name: '数据格式' },
  { id: 9, name: '数据库架构' },
  { id: 10, name: '技术优势' },
  { id: 11, name: '客户展示' },
  { id: 12, name: '研发协作' },
  { id: 13, name: '产品介绍' },
  { id: 14, name: '材料计算' },
  { id: 15, name: 'AI' },
  { id: 16, name: '实验数据' },
  { id: 17, name: '专利成果' },
  { id: 18, name: '技术成果' },
];

const mockEntries: Entry[] = [
  {
    id: 1,
    title: '量子计算材料设计平台',
    entry_type: 'product',
    visibility: 'public',
    category_id: 2,
    summary: '面向材料设计和量子计算场景的自动化计算平台。',
    content: '量子计算材料设计平台（QCMDP）是公司自主研发的面向下一代能源、半导体与超导材料的计算设计系统。平台无缝对接第一性原理计算（DFT）、分子动力学模拟（MD）及高通量计算引擎。通过图形化工作流，用户可以一键构建分子/晶体晶胞，提交高通量多尺度计算任务，并利用机器学习模型对海量计算结果进行高精度的逆向设计和性质筛选。\n\n### 核心功能\n1. **高通量多尺度工作流**：支持一键运行百级晶胞高通量筛选，支持VASP、QE等经典微观计算软件接口封装。\n2. **AI性质预估算法**：内置图神经网络（GNN）多物理量预估模型，能以1/1000的传统计算耗时实现95%以上的带隙与形成能预测。\n3. **量子化学哈密顿量算子优化**：为未来超导量子计算和超高深度比特态上的量子变分特征算子求解提供前期经典建模平台。',
    tags: ['产品介绍', '客户展示', '材料计算'],
    created_at: '2026-06-01T08:00:00Z',
    updated_at: '2026-06-10T01:57:11Z',
  },
  {
    id: 2,
    title: 'AI 驱动的实验数据分析能力',
    entry_type: 'tech',
    visibility: 'public',
    category_id: 3,
    summary: '结合 AI 模型与自动化流程，对实验数据进行分析、归档和辅助判断。',
    content: '本项目主要提供基于多模态大模型的实验数据智能推荐与自动归档系统。在研发流程中，由于各实验组测试设备零散、记录格式不一且大量使用图片/图表进行半定量表达，导致后续检索极为困难。\n\n### 技术实现路径\n* **数据采集层**：支持表征设备（如XRD/SEM/TEM/FTIR）产生的原始非结构化数据文件及实验日志扫描图。\n* **多模态AI识别层**：利用微调后的大模型直接读取图谱关键特征（如XRD峰位、SEM晶粒尺寸分布、TEM衍射斑点特征），并能关联自动提取文字标注。\n* **自动化分类与实体抽取**：从人工实验日志中，利用NLP提取时间、实验员、主要辅料、溶剂配比等，并对齐存入关系型库。',
    tags: ['技术优势', 'AI', '实验数据'],
    created_at: '2026-06-02T09:30:00Z',
    updated_at: '2026-06-09T10:20:00Z',
  },
  {
    id: 3,
    title: '某某智能计算方法专利',
    entry_type: 'patent',
    visibility: 'public',
    category_id: 4,
    summary: '用于展示公司在智能计算方向的技术成果。',
    content: '### 专利基本信息\n* **专利名称**：一种基于特征强化大模型的材料带隙高准确度预测方法及系统\n* **发明人**：研发一中心算法组、材料高通量探索实验室\n* **专利类型**：发明专利\n* **申请号**：CN202410123456.7\n* **授权状态**：已公开（实质审查中）\n\n### 权利要求摘要\n本发明公开了一种基于特征强化大模型的材料带隙高准确度预测方法及系统，属于新材料计算机辅助设计领域。本发明通过构建晶体三维周期性图神经网络模型（3D-CGNN），在节点的嵌入表达层首次中融入局部原子静电排斥系数（FEA）以及配位场能级分裂张量（LFST）。通过注意力机制融合几何空间距离，该专利提出的方案免去了高昂的DFT完全非局域态关联项校正，仅凭初始结构即可逼近HSE06杂化泛函计算精度，比经典GGA算法计算偏差降低48%，这标志着本公司在新一代人工智能化学探索方面的底层技术突破。',
    tags: ['专利成果', '技术成果', '客户展示'],
    created_at: '2026-06-03T11:00:00Z',
    updated_at: '2026-06-08T15:40:00Z',
  },
  {
    id: 4,
    title: '公司业务流程图',
    entry_type: 'asset',
    visibility: 'internal',
    category_id: 1,
    summary: '用于内部汇报和客户介绍 PPT 的业务流程图素材。',
    content: '本流程图展示了材料全生命周期计算及服务流程。由商务会谈开始，至材料体系参数抽取、自动化高通量算力排班、算法评估以及最终配方及表征方案交付。本流程属于公司核心运营知识，请勿向未经授权的外部客户泄露。\n\n### 推荐使用场景\n- **内部汇报**：年中总结与季度规划PPT的核心流程页。\n- **客户展示**：部分受信任的政企/科研客户进行私域沙盘演示时展示。\n- **新员工入职培训**：对各部门业务分工的全局观培训。',
    tags: ['PPT素材', '流程图', '内部资料'],
    created_at: '2026-06-04T14:00:00Z',
    updated_at: '2026-06-10T01:57:11Z',
  },
  {
    id: 5,
    title: '产品效果图 A',
    entry_type: 'asset',
    visibility: 'internal',
    category_id: 1,
    summary: '用于市场宣发和产品介绍的效果图。',
    content: '该素材为QCMDP 2.0 平台的晶体结构 3D 编辑器组件效果截图（包含自适应晶圆渲染、倒空间布里渊区切片，以及原子轨道电子云概率密度分布态的云图渲染效果）。该效果图具有强烈的未来感和精密的科研气息。\n\n### 宣发重点\n1. **设计感突出**：用于突出我司软件的前沿人机工程学水平。\n2. **科学可信**：严禁人为编造违背物理规律的原子耦合图，所有展示电子轨道均经过精算的2p/3d成键态反演。',
    tags: ['产品图片', '宣发素材', '内部资料'],
    created_at: '2026-06-05T15:00:00Z',
    updated_at: '2026-06-10T01:57:11Z',
  },
  {
    id: 6,
    title: '实地厂房照片',
    entry_type: 'asset',
    visibility: 'internal',
    category_id: 1,
    summary: '用于市场宣传和客户介绍的实地照片。',
    content: '该文件库包含位于合肥研发基地的「一号超净间自动化薄膜沉积与表征装备车间」高精实地照片。照片经过涉密脱敏，遮阳帘、防尘玻璃和反射区等做了美学曝光调节，可供高级汇报、画册、海报使用。\n\n### 安全说明\n- 已获得合肥基地物理反泄漏组审查通过，非涉密设备外显已妥善贴标。\n- 建议在排版中重点呈现**高精度超纯气罐组**和**机械臂全电动探针平台**。',
    tags: ['厂房照片', '宣发素材', '内部资料'],
    created_at: '2026-06-06T16:00:00Z',
    updated_at: '2026-06-10T01:57:11Z',
  },
  {
    id: 7,
    title: '材料结构数据条目',
    entry_type: 'data_item',
    visibility: 'internal',
    category_id: 5,
    summary: '用于 A 组和 B 组共同维护的材料结构数据定义。',
    content: '本条目定义了跨组进行晶体晶胞传输的非结构化数据字段映射与表定义，主要为了解决材料分析中原子编号混乱、空间群不对齐、非正交基矢转换错乱导致的跨算法异常。研发 A 组主要输出 CIF（晶体学信息文件）解析包，B 组进行深度预测与数据检索归档。\n\n### 数据共享架构要点\n- 统一坐标系统采用布拉维矢量的空间绝对实部笛卡尔坐标（Cartesian coordinates），不可直接写入晶胞相对分数坐标。\n- 磁性材料必须绑定各原子的起始自旋取向（Spin state, e.g., low-spin/high-spin），该项字段目前存在于扩展表。',
    tags: ['数据格式', '数据库架构', '研发协作'],
    created_at: '2026-06-07T10:00:00Z',
    updated_at: '2026-06-10T01:57:11Z',
  },
  {
    id: 8,
    title: '实验数据存储结构说明',
    entry_type: 'data_item',
    visibility: 'internal',
    category_id: 5,
    summary: '记录实验数据在数据库中的字段、格式和更新规则。',
    content: '本技术条目记录了公司统一存储研发集群（Cluster-S）中，物理材料配方表、表征测量关联表、材料缺陷标定日志的数据流转契约。通过该 Schema 说明，保障数据持久化和 RAG 等工具调用时，具备无损溯源、唯一主键对齐和多重时空哈希索引机制。\n\n### 维护信息\n- 由B组数据库管理组直接对口。\n- 后续如增加高温高压等极限制物表征项，需通过数据库字段拓客审批。',
    tags: ['数据库架构', '实验数据', '研发协作'],
    created_at: '2026-06-08T11:00:00Z',
    updated_at: '2026-06-10T01:57:11Z',
  },
];

const mockFiles: WikiFile[] = [
  {
    id: 1, entry_id: 4,
    original_filename: 'mock-business-flow.png',
    stored_filename: 'uuid_mock-business-flow.png',
    file_type: 'image/png', file_size: 1542300,
    storage_path: '/uploads/images/uuid_mock-business-flow.png',
    usage_type: 'PPT素材', created_at: '2026-06-04T14:00:00Z',
  },
  {
    id: 2, entry_id: 5,
    original_filename: 'mock-product-image.png',
    stored_filename: 'uuid_mock-product-image.png',
    file_type: 'image/png', file_size: 2840500,
    storage_path: '/uploads/images/uuid_mock-product-image.png',
    usage_type: '宣发素材', created_at: '2026-06-05T15:00:00Z',
  },
  {
    id: 3, entry_id: 6,
    original_filename: 'mock-factory-photo.png',
    stored_filename: 'uuid_mock-factory-photo.png',
    file_type: 'image/png', file_size: 4120900,
    storage_path: '/uploads/images/uuid_mock-factory-photo.png',
    usage_type: '宣发素材', created_at: '2026-06-06T16:00:00Z',
  },
];

const mockDataItems: DataItem[] = [
  {
    id: 1, entry_id: 7,
    data_name: 'CrystalStructureMap',
    data_definition: '晶体微观拓扑结构、空间群矢量、自由点位微扰振幅信息对齐表，用于A组CIF解析与B组性质算子预估的传输对准。',
    data_format: 'cif / json',
    storage_description: '存储于集群存储节点 /cluster-s/data/materials/structures_cif/ 目录下，按周周期备份。',
    schema_description: '字段包含: Bravais_matrix (double[3][3]), atom_symbols (string[]), fractional_positions (double[][3]), spin_states (int[]).',
    schema_version: 'v0.1',
    responsible_person: '研发 A 组 - 李工',
    updated_at: '2026-06-10T01:57:11Z',
  },
  {
    id: 2, entry_id: 8,
    data_name: 'LabCharacterizationRecord',
    data_definition: '保存物理气相/化学气相沉积测试样片、探针电流电压（I-V）特性及磁导率偏置磁矩测量的原始时序结构。',
    data_format: 'sql / json',
    storage_description: '存储于分布式分析库 PostgreSQL 物理模式 schema_lab 下的 tables: measurement_headers 及 measurement_series。',
    schema_description: '字段包含: sample_id (uuid PRIMARY KEY), device_code (varchar), stimulus_voltages (numeric[]), measured_currents (numeric[]), step_temp_k (float).',
    schema_version: 'v0.2',
    responsible_person: '研发 B 组 - 王工',
    updated_at: '2026-06-10T01:57:11Z',
  },
];

const mockUser: User = {
  id: 1, username: 'admin', display_name: '内部测试用户',
  created_at: '2026-06-10T01:57:11Z',
};

// ============================================================
// In-memory mutable store (lazy-init with deep clone)
// ============================================================

let _entries: Entry[] | null = null;
let _categories: Category[] | null = null;
let _tags: Tag[] | null = null;
let _files: WikiFile[] | null = null;
let _dataItems: DataItem[] | null = null;
let _nextId: number = 0;

function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

function initStore(): void {
  if (_entries === null) {
    _entries = clone(mockEntries);
    _categories = clone(mockCategories);
    _tags = clone(mockTags);
    _files = clone(mockFiles);
    _dataItems = clone(mockDataItems);
    _nextId = Math.max(..._entries.map((e) => e.id), ..._files.map((f) => f.id), ..._dataItems.map((d) => d.id), 0) + 1;
  }
}

function ensureStore(): { entries: Entry[]; categories: Category[]; tags: Tag[]; files: WikiFile[]; dataItems: DataItem[]; nextId: number } {
  initStore();
  return { entries: _entries!, categories: _categories!, tags: _tags!, files: _files!, dataItems: _dataItems!, nextId: _nextId };
}

// ============================================================
// CRUD: Entries
// ============================================================

export function getEntries(params?: {
  keyword?: string;
  entry_type?: string;
  visibility?: string;
  category_id?: string;
  tag?: string;
}, isInternal = false): Entry[] {
  const { entries } = ensureStore();

  let filtered = [...entries];

  // Visibility filter: public always visible; internal only if authenticated
  if (!isInternal) {
    filtered = filtered.filter((e) => e.visibility === 'public');
  } else if (params?.visibility) {
    filtered = filtered.filter((e) => e.visibility === params.visibility);
  }

  if (params?.entry_type) {
    filtered = filtered.filter((e) => e.entry_type === params.entry_type);
  }
  if (params?.category_id) {
    const catId = Number(params.category_id);
    if (!isNaN(catId)) {
      filtered = filtered.filter((e) => e.category_id === catId);
    }
  }
  if (params?.tag) {
    filtered = filtered.filter((e) => e.tags.includes(params.tag!));
  }
  if (params?.keyword) {
    const kw = params.keyword.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.title.toLowerCase().includes(kw) ||
        e.summary.toLowerCase().includes(kw) ||
        e.content.toLowerCase().includes(kw) ||
        e.tags.some((t) => t.toLowerCase().includes(kw))
    );
  }

  // Sort by updated_at desc
  filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return filtered;
}

export function getEntryById(id: number): Entry | undefined {
  const { entries } = ensureStore();
  return entries.find((e) => e.id === id);
}

export function addEntry(data: Partial<Entry> & { title: string; entry_type: EntryType; visibility: VisibilityType; content: string }): Entry {
  const store = ensureStore();
  const now = new Date().toISOString();
  const entry: Entry = {
    id: store.nextId++,
    title: data.title,
    entry_type: data.entry_type,
    summary: data.summary || '',
    content: data.content,
    visibility: data.visibility,
    category_id: data.category_id,
    tags: data.tags || [],
    created_at: now,
    updated_at: now,
  };
  store.entries.unshift(entry);
  // Sync any new tag names
  syncTags(entry.tags);
  return entry;
}

export function updateEntry(id: number, data: Partial<Entry>): Entry | null {
  const { entries } = ensureStore();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  const updated = {
    ...entries[idx],
    ...data,
    id: entries[idx].id, // immutable
    created_at: entries[idx].created_at, // immutable
    updated_at: new Date().toISOString(),
  };
  entries[idx] = updated;

  if (data.tags) syncTags(data.tags);
  return updated;
}

export function deleteEntry(id: number): boolean {
  const { entries } = ensureStore();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  return true;
}

// ============================================================
// CRUD: Categories
// ============================================================

export function getCategories(): Category[] {
  const { categories } = ensureStore();
  return [...categories].sort((a, b) => a.sort_order - b.sort_order);
}

// ============================================================
// CRUD: Tags
// ============================================================

export function getTags(): Tag[] {
  const { tags } = ensureStore();
  return [...tags];
}

export function syncTags(names: string[]): void {
  const { tags } = ensureStore();
  for (const name of names) {
    if (!tags.some((t) => t.name === name)) {
      tags.push({ id: Math.max(...tags.map((t) => t.id), 0) + 1, name });
    }
  }
}

// ============================================================
// CRUD: Files
// ============================================================

export function getFiles(entryId?: number): WikiFile[] {
  const { files } = ensureStore();
  if (entryId !== undefined) {
    return files.filter((f) => f.entry_id === entryId);
  }
  return [...files];
}

export function addFile(data: {
  entry_id: number;
  original_filename: string;
  file_type: string;
  file_size: number;
  usage_type: UsageType;
}): WikiFile {
  const store = ensureStore();
  const file: WikiFile = {
    id: store.nextId++,
    entry_id: data.entry_id,
    original_filename: data.original_filename,
    stored_filename: `uuid_${data.original_filename}`,
    file_type: data.file_type,
    file_size: data.file_size,
    storage_path: `/uploads/demo/${data.original_filename}`,
    usage_type: data.usage_type,
    created_at: new Date().toISOString(),
  };
  store.files.push(file);
  return file;
}

export function deleteFile(id: number): boolean {
  const { files } = ensureStore();
  const idx = files.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  files.splice(idx, 1);
  return true;
}

// ============================================================
// CRUD: DataItems
// ============================================================

export function getDataItems(entryId?: number): DataItem[] {
  const { dataItems } = ensureStore();
  if (entryId !== undefined) {
    return dataItems.filter((d) => d.entry_id === entryId);
  }
  return [...dataItems];
}

export function saveDataItem(data: Partial<DataItem> & { data_name: string; data_definition: string; data_format: string; schema_version: string; responsible_person: string }): DataItem {
  const store = ensureStore();

  // If data has an id and exists, update it
  if (data.id) {
    const idx = store.dataItems.findIndex((d) => d.id === data.id);
    if (idx !== -1) {
      store.dataItems[idx] = {
        ...store.dataItems[idx],
        ...data,
        id: store.dataItems[idx].id,
        updated_at: new Date().toISOString(),
      };
      return store.dataItems[idx];
    }
  }

  // If entry_id is provided and has an existing data item, update it
  if (data.entry_id) {
    const idx = store.dataItems.findIndex((d) => d.entry_id === data.entry_id);
    if (idx !== -1) {
      store.dataItems[idx] = {
        ...store.dataItems[idx],
        ...data,
        id: store.dataItems[idx].id,
        entry_id: store.dataItems[idx].entry_id,
        updated_at: new Date().toISOString(),
      };
      return store.dataItems[idx];
    }
  }

  // Create new
  const item: DataItem = {
    id: store.nextId++,
    entry_id: data.entry_id || 0,
    data_name: data.data_name,
    data_definition: data.data_definition,
    data_format: data.data_format,
    storage_description: data.storage_description || '',
    schema_description: data.schema_description || '',
    schema_version: data.schema_version,
    responsible_person: data.responsible_person,
    updated_at: new Date().toISOString(),
  };
  store.dataItems.push(item);
  return item;
}

export function deleteDataItem(id: number): boolean {
  const { dataItems } = ensureStore();
  const idx = dataItems.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  dataItems.splice(idx, 1);
  return true;
}

// ============================================================
// User (single mock user)
// ============================================================

export function getUser(): User {
  return { ...mockUser };
}

// ============================================================
// Auth credentials
// ============================================================

export const VALID_CREDENTIALS = { username: 'admin', password: 'admin123' };

// ============================================================
// Search (keyword-based, simulating semantic search)
// ============================================================

export interface SearchResult {
  entry: Entry;
  score: number;
}

export function searchEntries(query: string, isInternal = false): { results: SearchResult[]; source: string } {
  const { entries } = ensureStore();

  if (!query || !query.trim()) {
    return { results: [], source: 'keyword_demo' };
  }

  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const entry of entries) {
    // Skip internal entries for unauthenticated users
    if (!isInternal && entry.visibility === 'internal') continue;

    let score = 0;

    // Title match (weight: 10)
    if (entry.title.toLowerCase().includes(q)) {
      score += 10;
      // Exact title match bonus
      if (entry.title.toLowerCase() === q) score += 20;
    }

    // Summary match (weight: 5)
    if (entry.summary.toLowerCase().includes(q)) {
      score += 5;
    }

    // Tags match (weight: 3 per match)
    for (const tag of entry.tags) {
      if (tag.toLowerCase().includes(q)) {
        score += 3;
      }
    }

    // Content match (weight: 2)
    if (entry.content.toLowerCase().includes(q)) {
      score += 2;
      // Bonus for more occurrences
      const count = (entry.content.toLowerCase().match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += Math.min(count * 0.5, 5);
    }

    // Only include results with some relevance
    if (score > 0) {
      results.push({ entry, score: Math.round(score * 10) / 10 });
    }
  }

  // Sort by score desc
  results.sort((a, b) => b.score - a.score);

  return { results: results.slice(0, 10), source: 'keyword_demo' };
}
