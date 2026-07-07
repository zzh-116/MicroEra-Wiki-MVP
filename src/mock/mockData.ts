import {
  User,
  WikiSpace,
  WikiEntry,
  SourceFile,
  MarkdownFile,
  Reference,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  ServiceCard,
  DataItem,
  Paper,
  TemplateFile,
  BusinessMetric
} from '../types/wiki';

// Mock Users
export const mockUsers: User[] = [
  {
    id: 'u-1',
    username: 'admin',
    displayName: '管理员 (Admin)',
    role: 'administrator',
    department: '平台研发部',
    isLoggedIn: true
  },
  {
    id: 'u-2',
    username: 'researcher',
    displayName: '张研究员',
    role: 'researcher',
    department: '量子算法实验室',
    isLoggedIn: false
  }
];

// Mock Wiki Spaces (tree structure)
export const mockSpaces: WikiSpace[] = [
  {
    id: 's-root',
    name: '公司 Wiki',
    description: '微观纪元企业知识中心',
    visibility: 'public',
    children: [
      {
        id: 's-sandbox',
        name: 'Sandbox 项目知识库',
        description: '记录 Sandbox 项目计算过程、运行日志、核心结果与中间态文献数据',
        visibility: 'internal',
        parentId: 's-root'
      },
      {
        id: 's-papers',
        name: '论文知识库',
        description: '量子计算、生物、新材料等前沿领域的论文和专利知识沉淀',
        visibility: 'internal',
        parentId: 's-root',
        children: [
          {
            id: 's-papers-quantum',
            name: '量子计算',
            description: '量子误差校正、超导、离子阱算法等前沿论文',
            visibility: 'internal',
            parentId: 's-papers'
          },
          {
            id: 's-papers-bio',
            name: '生物科学',
            description: '蛋白质结构预测、基因计算、药物靶点模拟等文献',
            visibility: 'internal',
            parentId: 's-papers'
          },
          {
            id: 's-papers-materials',
            name: '材料科学',
            description: '固态电池材料、超导材料计算化学等文献',
            visibility: 'internal',
            parentId: 's-papers'
          }
        ]
      },
      {
        id: 's-tech',
        name: '技术知识库',
        description: '底层基础设施、编译引擎与工具链标准',
        visibility: 'public',
        parentId: 's-root'
      },
      {
        id: 's-data',
        name: '数据条目库',
        description: '业务定义、数据库Schema、存储位置与研发人员参考',
        visibility: 'internal',
        parentId: 's-root'
      },
      {
        id: 's-template',
        name: '模板与标准文件库',
        description: '官方核准的各类项目、报告和说明文档模板',
        visibility: 'internal',
        parentId: 's-root'
      },
      {
        id: 's-business',
        name: '商业价值展示',
        description: '项目 ROI、专利及论文产出、商业路演资产等可视化看板',
        visibility: 'internal',
        parentId: 's-root'
      }
    ]
  }
];

// Flat helper to get sub-spaces if needed
export function getFlatSpaces(spaces: WikiSpace[]): WikiSpace[] {
  let result: WikiSpace[] = [];
  spaces.forEach(s => {
    result.push(s);
    if (s.children) {
      result = result.concat(getFlatSpaces(s.children));
    }
  });
  return result;
}

// Mock Source Files
export const mockSourceFiles: SourceFile[] = [
  {
    id: 'f-1',
    entryId: 'e-stabilizer-project',
    originalFilename: 'stabilizer_project_result.pdf',
    storedFilename: '1a2b3c4d5e6f_stabilizer_project_result.pdf',
    fileType: 'pdf',
    fileSize: '4.2 MB',
    storagePath: '/nas/projects/stabilizer/stabilizer_project_result.pdf',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    version: 'v1.0',
    uploadedBy: '张研究员',
    uploadedAt: '2026-06-30 14:22:00',
    isLocked: true,
    visibility: 'internal'
  },
  {
    id: 'f-2',
    entryId: 'e-stabilizer-project',
    originalFilename: 'stabilizer_calc_log.txt',
    storedFilename: '2b3c4d5e6f7g_stabilizer_calc_log.txt',
    fileType: 'txt',
    fileSize: '820 KB',
    storagePath: '/nas/projects/stabilizer/logs/stabilizer_calc_log.txt',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    version: 'v1.2',
    uploadedBy: '系统守护进程',
    uploadedAt: '2026-06-29 23:11:05',
    isLocked: false,
    visibility: 'internal'
  },
  {
    id: 'f-3',
    entryId: 'e-paper-correction',
    originalFilename: 'quantum_error_correction_stabilizer_codes.pdf',
    storedFilename: '3c4d5e6f7g8h_quantum_error_correction_stabilizer_codes.pdf',
    fileType: 'pdf',
    fileSize: '2.1 MB',
    storagePath: '/nas/papers/quantum/quantum_error_correction_stabilizer_codes.pdf',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856',
    version: 'v1.0',
    uploadedBy: '张研究员',
    uploadedAt: '2026-05-15 10:00:00',
    isLocked: true,
    visibility: 'internal'
  },
  {
    id: 'f-template-1',
    entryId: 'e-template-retrospective',
    originalFilename: 'project_retrospective_report_v1.3.docx',
    storedFilename: 'template_001_project_retrospective_report_v1.3.docx',
    fileType: 'docx',
    fileSize: '340 KB',
    storagePath: '/nas/templates/admin/project_retrospective_report_v1.3.docx',
    sha256: 'ab86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a12',
    version: 'v1.3',
    uploadedBy: '质量保障组 (QA)',
    uploadedAt: '2026-04-10 16:30:00',
    isLocked: true,
    visibility: 'internal'
  }
];

// Mock Markdown Files (MarkItDown converted outputs)
export const mockMarkdownFiles: MarkdownFile[] = [
  {
    id: 'md-1',
    sourceFileId: 'f-1',
    mdFilename: 'stabilizer_project_result.md',
    mdStoragePath: '/nas/projects/stabilizer/stabilizer_project_result.md',
    markdownContent: `
# 稳定子算法 Sandbox 计算项目 - 结果报告

## 1. 实验基本概况
本计算项目于 **Sandbox-ID: SB-8849-QC** 及 **Session-ID: MQ-SESS-9922** 中执行，主要目的为在超导量子芯片虚拟噪声环境下，针对多比特稳定子编码（Stabilizer Codes）的纠错阈值进行蒙特卡洛（Monte Carlo）拟合。

## 2. 计算核心结果
在引入物理泡利噪声误差率 $p$ 从 $10^{-4}$ 到 $10^{-1}$ 的扫描过程中，我们通过 **Stabilizer-Simulator** 进行了 $10^7$ 次随机错误综合征抽取与纠错解码。
实验得出了以下关键数据：

- **零错保真度 (Zero-error Fidelity)**: 比特数 $d=3$ 时，纠错后残余逻辑错误率在物理误差率 $p_0 \approx 0.015$ 以下时低于未纠错状态，该点即为**伪阈值点 (Pseudo-threshold)**。
- **纠错成功率拟合**: 拟合公式满足下述幂律关系：
  $$ P_{\\text{error}} = C \\cdot \\left(\\frac{p}{p_{\\text{th}}}\\right)^{\\frac{d+1}{2}} $$

### 计算结果数值：
\`\`\`json
{
  "project_id": "SB-8849-QC",
  "stabilizer_nodes": 7,
  "logical_error_rate_threshold": 0.0152,
  "monte_carlo_runs": 10000000,
  "updated_at": "2026-06-30"
}
\`\`\`

## 3. 引用文献
本实验的仿真参数和解码器核心逻辑部分参考了：
1. **《Quantum Error Correction with Stabilizer Codes》** (Gottesman, 1997)
2. **《Surface Codes: Towards Practical Large-Scale Quantum Computation》** (Fowler et al., 2012)
`,
    parserName: 'MarkItDown',
    parserVersion: 'v0.3.1',
    parseStatus: 'success',
    createdAt: '2026-06-30 14:25:12'
  },
  {
    id: 'md-2',
    sourceFileId: 'f-3',
    mdFilename: 'quantum_error_correction_stabilizer_codes.md',
    mdStoragePath: '/nas/papers/quantum/quantum_error_correction_stabilizer_codes.md',
    markdownContent: `
# Quantum Error Correction with Stabilizer Codes
*Author: Gottesman*

## Abstract
This paper introduces the stabilizer code formalism for quantum error-correcting codes. This class of codes, which includes all previously known codes and many new ones, is analogous to classical linear codes.

## Introduction to Stabilizer Formalism
Let $\\mathcal{G}_n$ be the $n$-qubit Pauli group. A stabilizer code $\\mathcal{C}$ is defined as the joint $+1$-eigenspace of an abelian subgroup $\\mathcal{S} \\subset \\mathcal{G}_n$ which does not contain $-I$.
`,
    parserName: 'MarkItDown',
    parserVersion: 'v0.3.1',
    parseStatus: 'success',
    createdAt: '2026-05-15 10:12:00'
  }
];

// Mock References
export const mockReferences: Reference[] = [
  {
    id: 'r-1',
    fromEntryId: 'e-stabilizer-project',
    toEntryId: 'e-paper-correction',
    sourceFileId: 'f-1',
    markdownFileId: 'md-1',
    locator: 'section=计算结果',
    quote: '本实验的仿真参数和解码器核心逻辑部分参考了《Quantum Error Correction with Stabilizer Codes》',
    referenceType: 'paper',
    title: 'Quantum Error Correction with Stabilizer Codes',
    updatedAt: '2026-06-30'
  },
  {
    id: 'r-2',
    fromEntryId: 'e-stabilizer-project',
    toEntryId: 'e-data-stabilizer-schema',
    sourceFileId: 'f-1',
    markdownFileId: 'md-1',
    locator: 'section=计算结果.json',
    quote: '数据导出格式遵循稳定子计算结果Schema定义 v0.2',
    referenceType: 'sandbox_result',
    title: '稳定子计算结果数据结构',
    updatedAt: '2026-06-30'
  }
];

// Mock Papers Detail
export const mockPapers: Paper[] = [
  {
    id: 'p-1',
    entryId: 'e-paper-correction',
    title: 'Quantum Error Correction with Stabilizer Codes',
    authors: 'Daniel Gottesman',
    year: 1997,
    doi: '10.1103/PhysRevA.54.1862',
    abstract: '本文提出了用于构建量子纠错码的稳定子（Stabilizer）群论形式，这是量子计算理论的基石之一。它类比了经典线性码，极大简化了量子纠错线路的分析与描述，使得描述 $n$ 门大系统只需要 $n-k$ 个群元发生器，而不是复杂的态向量叠加。',
    field: '量子计算',
    relatedProjectIds: ['e-stabilizer-project'],
    sourceFileId: 'f-3',
    markdownFileId: 'md-2'
  }
];

// Mock Data Items
export const mockDataItems: DataItem[] = [
  {
    id: 'd-1',
    entryId: 'e-data-stabilizer-schema',
    dataName: '稳定子计算结果数据结构 (stabilizer_result_schema)',
    dataDefinition: '该数据条目定义了在 Sandbox 项目或 MiQi 中调用仿真计算时，输出结果的 JSON Schema 标准，便于后续自动化 RAG 与结果提取。',
    dataFormat: 'JSON / Drizzle Schema',
    schemaVersion: 'v0.2',
    storageDescription: '存储于 /nas/metadata/schemas/stabilizer_result.json 或数据库表 simulation_outputs',
    responsiblePerson: '张研究员',
    latestUpdatedAt: '2026-06-28 10:15:00'
  }
];

// Mock Templates
export const mockTemplates: TemplateFile[] = [
  {
    id: 't-1',
    entryId: 'e-template-retrospective',
    templateName: '项目复盘报告标准模板 (Project Retrospective Template)',
    approvedStatus: 'approved',
    version: 'v1.3',
    department: '质量保障组 / 平台运营组',
    projectType: 'Sandbox 计算与实验项目类',
    downloadUrl: '#download-template-1',
    latestApprovedAt: '2026-04-10 16:30:00',
    fileSize: '340 KB',
    sha256: 'ab86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a12',
    downloads: 145
  }
];

// Mock Business Metrics
export const mockBusinessMetrics: BusinessMetric[] = [
  {
    id: 'bm-1',
    projectEntryId: 'e-stabilizer-project',
    metricName: '投资回报率 (Estimated ROI)',
    metricValue: '320%',
    source: '量子商业估值组数据模型 v4.1',
    updatedAt: '2026-06-30'
  },
  {
    id: 'bm-2',
    projectEntryId: 'e-stabilizer-project',
    metricName: '研发节省成本 (Saved Computing Costs)',
    metricValue: '约 45.2 万元',
    source: '平台算力监控与资源优化中心 (MCP)',
    updatedAt: '2026-06-30'
  },
  {
    id: 'bm-3',
    projectEntryId: 'e-stabilizer-project',
    metricName: '催生关联专利产出 (Patents Triggered)',
    metricValue: '2 项 (在审中)',
    source: '公司知识产权法务部',
    updatedAt: '2026-06-30'
  }
];

// Mock Service Cards
export const mockServiceCards: ServiceCard[] = [
  {
    id: 'sc-1',
    entryId: 'e-stabilizer-project',
    serviceType: 'rag',
    name: '稳定子纠错算法 RAG 问答服务',
    description: '通过对该项目过程报告、仿真日志、参数配置文件以及 Gottesman 经典文献建立向量索引，支持基于此条目的精准深度智能问答。',
    inputSchema: '{"query": "string", "temperature": "float", "top_k": "int"}',
    outputSchema: '{"answer": "string", "references": [{"title": "string", "quote": "string"}]}',
    status: 'demo',
    mockEndpoint: '/api/v1/services/rag-stabilizer'
  },
  {
    id: 'sc-2',
    entryId: 'e-stabilizer-project',
    serviceType: 'mcp',
    name: 'Stabilizer Simulator MCP 工具服务',
    description: '封装为 MCP (Model Context Protocol) 协议标准工具。使 AI 智能体（如 MiQi、Claude）能直接在聊天窗口中触发对稳定子算法的代码仿真或日志检索。',
    inputSchema: '{"simulator_params": {"d": "int", "error_rate": "float", "runs": "int"}}',
    outputSchema: '{"status": "success", "fidelity": "float", "plot_url": "string"}',
    status: 'connected',
    mockEndpoint: '/api/mcp/v1/tools/simulate_stabilizer'
  },
  {
    id: 'sc-3',
    entryId: 'e-stabilizer-project',
    serviceType: 'miqi',
    name: 'MiQi 稳定子算法智能体可调用服务',
    description: '在 MiQi 大脑中注册为此项目的专有动作服务。当用户向 MiQi 询问“帮我分析 SB-8849-QC 项目的纠错阈值”时，MiQi 将自动联动本服务。',
    inputSchema: '{"session_id": "string", "analyze_threshold": "boolean"}',
    outputSchema: '{"report_summary": "string", "critical_plots": ["string"]}',
    status: 'planning',
    mockEndpoint: '/api/v1/miqi/actions/analyze_stabilizer'
  }
];

// Product and Document-level Version Metadata
export const mockSystemVersionInfo = {
  productVersion: "Wiki v0.1.0-alpha",
  productStage: "alpha",
  productVersionDescription: "原型验证阶段，用于确认信息架构、页面形态、知识条目组织方式与后续开发方向。",
  
  documentVersion: "需求分析文档 v0.2",
  documentVersionDescription: "补充用户故事、业务流程、权限、数据结构和版本号规则。",
  documentLastUpdated: "2026-07-01",
  
  projectName: "微观纪元企业知识库 / Miqro Wiki",
  demander: "公司内部商业智能组，许越"
};

// Mock Wiki Entries
export const mockEntries: WikiEntry[] = [
  // 1. Sandbox Project Entry
  {
    id: 'e-stabilizer-project',
    spaceId: 's-sandbox',
    title: '稳定子算法 Sandbox 计算项目',
    entryType: 'project',
    summary: '该项目记录稳定子算法在 Sandbox 中的计算过程、结果文件、引用文献和可服务化调用方式。不仅沉淀了仿真过程和 Monte Carlo 的拟合计算指标，更能通过 RAG、MCP 以及 MiQi 在全平台进行调用。',
    content: `
# 稳定子算法 Sandbox 计算项目 (Stabilizer Monte Carlo Simulation)

## 项目背景
本条目详细归档了微观纪元量子计算硬件仿真团队，在 **Sandbox SB-8849-QC** 沙箱环境中所运行的稳定子纠错码（Stabilizer Codes）实验。
该实验基于 Daniel Gottesman 在 1997 年提出的稳定子群论，旨在研究在特定的物理缺陷率下，纠错后逻辑比特的残余错误。

## 关联 Sandbox ID与 Session ID
- **Sandbox-ID**: \`SB-8849-QC\`
- **Session-ID**: \`MQ-SESS-9922\` (微观纪元 MiQi Session)

## 项目核心过程
1. **[需求提出 - 2026-06-25]**: 量子计算实验室提出需要多达 7 比特距离的纠错码伪阈值模拟指标。
2. **[算法编写与编译 - 2026-06-26]**: 采用微观纪元自研的编译引擎，优化稳定子哈密顿量的纠错矩阵。
3. **[计算任务提交 - 2026-06-28]**: 将模拟任务提交到 **Sandbox 虚拟算力算子大厅**，执行 Monte Carlo 模拟。
4. **[结果生成与转换 - 2026-06-30]**: 仿真结果生成完毕。自动调用平台底层的 **MarkItDown** 工具将实验日志和 PDF 导出文件转化为标准的富文本 Markdown 进行索引和知识归档。
5. **[人工复核与归档 - 2026-06-30]**: 经由张研究员审核确认，零错保真度阈值符合预期，正式发布该 Wiki 知识条目。

## 关键技术指标与商业价值
经核算，相较于在传统的全状态保真度数值模拟（State Vector），本稳定子群论高效模拟算法将**计算开销降低了 90%**，为后续大比特模拟节省了数十万的算力采购。
详细的 ROI 看板请点击右侧 **[量子计算项目商业价值摘要]** 关联卡片跳转。
`,
    visibility: 'internal',
    tags: ['量子纠错', '稳定子码', 'Sandbox', 'Monte Carlo', '伪阈值', 'MiQi 可调用'],
    owner: '张研究员',
    ownerDepartment: '量子算法实验室',
    latestUpdatedAt: '2026-06-30 15:45:00',
    createdAt: '2026-06-25 09:00:00',
    sourceFileIds: ['f-1', 'f-2'],
    markdownFileIds: ['md-1'],
    referenceIds: ['r-1', 'r-2'],
    relatedEntryIds: ['e-paper-correction', 'e-data-stabilizer-schema', 'e-business-quantum-value', 'e-stabilizer-service-entry'],
    graphNodeIds: ['gn-1', 'gn-2', 'gn-3', 'gn-4', 'gn-5', 'gn-6'],
    entryVersion: 'v1.0',
    lastUpdatedAt: '2026-06-30 15:45:00',
    updatedBy: '张研究员',
    versionNote: '内容正式定稿，经技术安全委员会核准发布，已挂载为稳定 RAG 神经检索大模型与 MCP 沙箱算子服务。',
    isStableVersion: true,
    entryVersionHistory: [
      {
        version: 'v1.0',
        date: '2026-06-30 15:45:00',
        updatedBy: '张研究员',
        note: '内容正式定稿，经技术安全委员会核准发布，已挂载为稳定 RAG 神经检索大模型与 MCP 沙箱算子服务。',
        current: true,
        titleBackup: '稳定子算法 Sandbox 计算项目',
        summaryBackup: '该项目记录稳定子算法在 Sandbox 中的计算过程、结果文件、引用文献和可服务化调用方式。不仅沉淀了仿真过程和 Monte Carlo 的拟合计算指标，更能通过 RAG、MCP 以及 MiQi 在全平台进行调用。',
        contentBackup: `\n# 稳定子算法 Sandbox 计算项目 (Stabilizer Monte Carlo Simulation)\n\n## 项目背景\n本条目详细归档了微观纪元量子计算硬件仿真团队，在 **Sandbox SB-8849-QC** 沙箱环境中所运行的稳定子纠错码（Stabilizer Codes）实验。\n该实验基于 Daniel Gottesman 在 1997 年提出的稳定子群论，旨在研究在特定的物理缺陷率下，纠错后逻辑比特的残余错误。\n\n## 关联 Sandbox ID与 Session ID\n- **Sandbox-ID**: \`SB-8849-QC\`\n- **Session-ID**: \`MQ-SESS-9922\` (微观纪元 MiQi Session)\n\n## 项目核心过程\n1. **[需求提出 - 2026-06-25]**: 量子计算实验室提出需要多达 7 比特距离的纠错码伪阈值模拟指标。\n2. **[算法编写与编译 - 2026-06-26]**: 采用微观纪元自研的编译引擎，优化稳定子哈密顿量的纠错矩阵。\n3. **[计算任务提交 - 2026-06-28]**: 将模拟任务提交到 **Sandbox 虚拟算力算子大厅**，执行 Monte Carlo 模拟。\n4. **[结果生成与转换 - 2026-06-30]**: 仿真结果生成完毕。自动调用平台底层的 **MarkItDown** 工具将实验日志和 PDF 导出文件转化为标准的富文本 Markdown 进行索引和知识归档。\n5. **[人工复核与归档 - 2026-06-30]**: 经由张研究员审核确认，零错保真度阈值符合预期，正式发布该 Wiki 知识条目。\n\n## 关键技术指标与商业价值\n经核算，相较于在传统的全状态保真度数值模拟（State Vector），本稳定子群论高效模拟算法将**计算开销降低了 90%**，为后续大比特模拟节省了数十万的算力采购。\n详细的 ROI 看板请点击右侧 **[量子计算项目商业价值摘要]** 关联卡片跳转。\n`
      },
      {
        version: 'v0.3',
        date: '2026-06-28 11:20:00',
        updatedBy: '张研究员',
        note: '增加与 Gottesman 1997 年量子纠错开山文献的深度学术关联，配置知识图谱拓扑关系，扩充引用标注节点。',
        titleBackup: '稳定子算法 Sandbox 计算项目 (结构化图谱版)',
        summaryBackup: '记录稳定子算法在 Sandbox 中的计算过程与引用文献。构建知识图谱连线。',
        contentBackup: `\n# 稳定子算法 Sandbox 计算项目 (纠错码基础框架)\n\n## 1. 理论基础引用\n本纠错码基于 Gottesman 1997 年经典体系，在 Sandbox 中通过自研编译算子对哈密顿稳定性生成矩阵进行多项式求解。\n\n- **文献引证**: Quantum Error Correction with Stabilizer Codes (Daniel Gottesman)\n- **映射空间**: s-papers-quantum (量子计算文献库)\n`
      },
      {
        version: 'v0.2',
        date: '2026-06-26 14:10:00',
        updatedBy: '系统守护进程',
        note: '补充 MarkItDown 对物理 PDF 实验日志的自动转化 Markdown 切片，提取公式与 Monte Carlo 折线图数据元。',
        titleBackup: '稳定子算法 Sandbox 计算项目 (MarkItDown 解析版)',
        summaryBackup: '系统级 PDF 原始文件哈希注入与 MarkItDown 解析结果同步。',
        contentBackup: `\n# 稳定子算法 Sandbox 计算项目 (物理文件 MarkItDown 提取稿)\n\n已成功摄入 PDF/TXT 文献，通过物理流挂载，零错拟合曲线已提取，存储于 NAS。`
      },
      {
        version: 'v0.1',
        date: '2026-06-25 09:00:00',
        updatedBy: '张研究员',
        note: '初始录入，确立项目物理标识与仿真卡片提纲。',
        titleBackup: '稳定子算法 Sandbox 计算项目 (草案)',
        summaryBackup: '初始录入草案。',
        contentBackup: `\n# 稳定子算法 Sandbox 计算项目 (草案)\n\n初始录入，包含基础定义、附件和关联条目。`
      }
    ]
  },

  // 2. Public Concept Entry
  {
    id: 'e-ai-data-analysis',
    spaceId: 's-tech',
    title: 'AI 驱动的实验数据分析能力',
    entryType: 'concept',
    summary: '展示微观纪元使用企业自研 AI 模型及知识图谱进行高维实验数据分析、归档和辅助判断的领先技术水平与平台优势。',
    content: `
# AI 驱动的实验数据分析能力 (AI-Driven Experimental Data Analysis)

## 概述
微观纪元致力于将 AI 模型、Agent 技术（如 MiQi 智能助手）与高维科学实验沙箱（Sandbox）深度打通。
我们的核心能力在于，不仅让 AI 作为一个被动的对话窗口，而是让它主动解析复杂的科学输出结果（如 CIF 结晶格式、仿真 HDF5、计算日志等），自动通过 **MarkItDown** 组件抽取语义，并形成**可演化、可追溯、可联动**的知识图谱。

## 核心优势
1. **全链路可追溯 (Traceability)**: 从最终 AI 提问给出的建议，可一键反向穿透到论文、专利、以及产生这些数据的 Sandbox 具体计算 Session 算子，杜绝 AI 幻觉，保证工业级学术严谨。
2. **多模态解析能力 (Multimodal Parsing)**: 系统后台集成了先进的文档转换模块，可对上传的 PDF、PPT、Word、Excel 文件进行结构化解析，识别 LaTeX 数学公式和复杂的 JSON。
3. **知识图谱级关联 (KG-Association)**: 项目、论文、数据结构、可调用 API 不再是孤立的资产，而是相互连接的知识网，支持 MCP（Model Context Protocol）由 AI 自动编排调用。
`,
    visibility: 'public',
    tags: ['AI 驱动', '多模态解析', '知识图谱', '微观纪元优势'],
    owner: '平台研发部',
    ownerDepartment: 'AI 算法组',
    latestUpdatedAt: '2026-06-29 09:12:00',
    createdAt: '2026-01-10 08:00:00',
    sourceFileIds: [],
    markdownFileIds: [],
    referenceIds: [],
    relatedEntryIds: ['e-stabilizer-project'],
    graphNodeIds: []
  },

  // 3. Paper Entry
  {
    id: 'e-paper-correction',
    spaceId: 's-papers-quantum',
    title: 'Quantum Error Correction with Stabilizer Codes',
    entryType: 'paper',
    summary: '量子纠错理论的开山之作，由 Daniel Gottesman 于 1997 年提出。该论文奠定了稳定子代码在量子误差校正中的绝对统治地位。',
    content: `
# Quantum Error Correction with Stabilizer Codes
- **Author**: Daniel Gottesman (1997)
- **DOI**: \`10.1103/PhysRevA.54.1862\`

## 文献核心提炼
该文献通过引入泡利群（Pauli Group）的阿贝尔子群（Abelian Subgroups），创立了稳定子（Stabilizer）群论。
在传统的纠错码表示中，我们需要描述一个复数态空间的态向量（维度为 $2^n$），这在计算模拟中是完全不可逾越的。
而 Gottesman 证明，通过定义稳定子群发生器，我们只需要保存 $n-k$ 个群元（大小为 $O(n^2)$），就能完整描述一切量子纠错过程。

## 平台内引用情况
本论文的稳定子仿真和错误抽取算法，已被平台研发部完整实现为 **Sandbox 仿真计算算子**。
在 **稳定子算法 Sandbox 计算项目 (e-stabilizer-project)** 中，实验配置、伪阈值评估等计算均源于本论文公式。
`,
    visibility: 'internal',
    tags: ['量子纠错', '群论', 'Daniel Gottesman', '1997', '基础文献'],
    owner: '张研究员',
    ownerDepartment: '量子算法实验室',
    latestUpdatedAt: '2026-05-15 10:20:00',
    createdAt: '2026-05-15 10:00:00',
    sourceFileIds: ['f-3'],
    markdownFileIds: ['md-2'],
    referenceIds: [],
    relatedEntryIds: ['e-stabilizer-project'],
    graphNodeIds: []
  },

  // 4. Data Item Entry
  {
    id: 'e-data-stabilizer-schema',
    spaceId: 's-data',
    title: '稳定子计算结果数据结构',
    entryType: 'data_item',
    summary: '此条目详细规范了量子纠错模拟结果的数据存储、元数据定义以及 Schema 规范，是后端 Drizzle 库表、RAG 数据检索切片的重要规约。',
    content: `
# 稳定子计算结果数据结构 (Stabilizer Result Metadata & Database Schema)

## 概述
为了让 AI 智能体（如 MiQi）能够无缝、精确地提取 Sandbox 中的实验指标，系统对稳定子模拟结果的落库和导出格式进行了严格的 Schema 定义。

## 字段规范 (Schema v0.2)
- \`project_id\` (String, Required): 对应 Sandbox 运行沙箱 ID。
- \`stabilizer_nodes\` (Integer, Required): 物理比特跨度。
- \`logical_error_rate_threshold\` (Double): 纠错模拟得出的物理错误率拟合伪阈值点。
- \`monte_carlo_runs\` (Integer): 蒙特卡洛抽样运行次数。
- \`result_data_url\` (String): 在 NAS 中存储的 HDF5 或 CSV 原始文件路径。

## 数据库架构设计 (PostgreSQL 建议)
在未来的微观纪元生产数据库设计中，此 Schema 将映射到 \`simulation_outputs\` 关系表中，并通过外键 \`wiki_entry_id\` 级联至 Wiki 系统，支撑秒级的元数据搜索与 RAG 文本拼装。
`,
    visibility: 'internal',
    tags: ['数据 Schema', '数据库设计', 'Metadata', 'RAG 规范'],
    owner: '张研究员',
    ownerDepartment: '量子算法实验室',
    latestUpdatedAt: '2026-06-28 10:15:00',
    createdAt: '2026-06-20 09:00:00',
    sourceFileIds: [],
    markdownFileIds: [],
    referenceIds: [],
    relatedEntryIds: ['e-stabilizer-project'],
    graphNodeIds: []
  },

  // 5. Template Entry
  {
    id: 'e-template-retrospective',
    spaceId: 's-template',
    title: '项目复盘报告模板',
    entryType: 'template',
    summary: '公司统一的项目复盘与计算实验总结 Word/Docx 格式标准官方模板，已获得平台运营组核准发布，支持一键下载。',
    content: `
# 项目复盘报告模板 (Standard Project Retrospective Template v1.3)

## 说明
微观纪元要求所有的 Sandbox 计算实验和阶段性科研项目，在归档至企业 Wiki 时，须对照本复盘模板进行撰写。

## 模板大纲
1. **项目概览**: 包含 Sandbox ID, Session ID, 负责人与所属核心技术方向。
2. **核心成果**: 项目的主要科学结论，核心指标是否符合预期，物理参数对比。
3. **研发开销与耗时**: 详细列出消耗的算力、机时、API 调用次数。
4. **源文件及哈希清单**: 要求列出关键输出文件、存储路径与 SHA256 哈希值（用于防篡改校验）。
5. **引用来源**: 项目所引用的国际顶级期刊论文、前置专利或标准文档。
6. **商业转化可能**: 包含 ROI 预测、是否可转化为平台 MCP 服务、是否能被 MiQi 智能体独立调用。
`,
    visibility: 'internal',
    tags: ['办公模板', '项目复盘', '核准发布', '标准流程'],
    owner: '平台研发部',
    ownerDepartment: '质量保障组',
    latestUpdatedAt: '2026-04-10 16:30:00',
    createdAt: '2026-04-01 09:00:00',
    sourceFileIds: ['f-template-1'],
    markdownFileIds: [],
    referenceIds: [],
    relatedEntryIds: ['e-stabilizer-project'],
    graphNodeIds: []
  },

  // 6. Business Value Entry
  {
    id: 'e-business-quantum-value',
    spaceId: 's-business',
    title: '量子计算项目商业价值摘要',
    entryType: 'business_value',
    summary: '基于稳定子纠错算法项目的成功实验，进行 ROI、算力开销节省、专利衍生等商业化资产指标的深度总结，可一键生成汇报 PPT 简报。',
    content: `
# 量子计算项目商业价值摘要 (Business Value of Quantum Error Correction Stabilizer Projects)

## 商业价值论证
量子纠错仿真是一项高算力消耗的模拟。由于在物理量子比特数增加时，状态空间指数级扩张，常规的仿真任务动辄消耗数十万的公共云算力。
而本 **稳定子算法 Sandbox 计算项目 (e-stabilizer-project)** 采用 Gottesman 稳定子形式优化后的算法，成功在 Sandbox 虚拟算力大厅中完成了 **10,000,000 级 Monte Carlo 模拟**：
- **节约成本**: 降低了近 **90%** 的计算成本，累计节约开销约 **45.2 万元**。
- **项目收益**: 该阈值参数目前已作为关键参数整合至我们最新的硬件量子纠错芯片原型设计中，大大降低了研发试错成本。
- **IP 沉淀**: 衍生出 2 项核心量子芯片设计发明专利，均已在审。
- **论文产出**: Gottesman 论文平台内引用次数大幅攀升，助力多项子项目并行推进。
`,
    visibility: 'internal',
    tags: ['商业价值', 'ROI看板', '节约成本', '成果展示', 'MiQi 汇报素材'],
    owner: '商业智能组',
    ownerDepartment: '市场部 / 商业化中心',
    latestUpdatedAt: '2026-06-30 15:45:00',
    createdAt: '2026-06-28 09:00:00',
    sourceFileIds: [],
    markdownFileIds: [],
    referenceIds: ['r-1', 'r-2'],
    relatedEntryIds: ['e-stabilizer-project'],
    graphNodeIds: []
  },

  // 7. Service Entry
  {
    id: 'e-stabilizer-service-entry',
    spaceId: 's-tech',
    title: '稳定子算法知识与工具调用服务',
    entryType: 'service',
    summary: '此条目归档了本算法和知识库能对外或对内提供的 RAG 查询接口、MCP 工具集以及 MiQi 可直接调用的微服务列表，展示真正的知识服务化价值。',
    content: `
# 稳定子算法知识与工具调用服务 (Stabilizer Algorithm Knowledge Service & APIs)

## 知识服务化定位
微观纪元 AI Wiki 绝非静态卡片数据库，而是**可以被 AI 智能体直接调用、执行和提问的活性知识网络**。
当我们在本 Wiki 建立稳定子计算项目条目并导入 Markdown 结果后，系统会自动为该条目配套生成三种调用通道。

## 1. RAG 知识检索服务 (Retrieval-Augmented Generation)
- **服务说明**: 智能客服、RAG 管道可使用此接口进行对该计算结果的自然语言提问。
- **状态**: \`可演示 (Demo)\`
- **调用地址**: \`/api/v1/services/rag-stabilizer\`

## 2. MCP 算子工具服务 (Model Context Protocol)
- **服务说明**: 支持在 Claude Desktop, cursor, 或公司内部的 LLM 集群中作为 Tools 载入，AI 可直接执行 Monte Carlo 模拟，查询残余保真度。
- **状态**: \`已接入 (Connected)\`
- **调用地址**: \`/api/mcp/v1/tools/simulate_stabilizer\`

## 3. MiQi 大脑可调用服务
- **服务说明**: 深度融入微观纪元 MiQi 专有动作库中。MiQi 在分析用户项目进度的决策环中能直接触发运行。
- **状态**: \`规划中 (Planning)\`
- **调用地址**: \`/api/v1/miqi/actions/analyze_stabilizer\`
`,
    visibility: 'internal',
    tags: ['RAG服务', 'MCP协议', 'MiQi可调用', 'API服务化'],
    owner: '平台研发部',
    ownerDepartment: '集成集成与协议组',
    latestUpdatedAt: '2026-06-30 15:50:00',
    createdAt: '2026-06-29 09:00:00',
    sourceFileIds: [],
    markdownFileIds: [],
    referenceIds: [],
    relatedEntryIds: ['e-stabilizer-project'],
    graphNodeIds: []
  }
];

// Mock Knowledge Graph Nodes
export const mockGraphNodes: KnowledgeGraphNode[] = [
  { id: 'gn-1', label: '稳定子算法 Sandbox 计算项目', type: 'project', entryId: 'e-stabilizer-project', description: '核心 Sandbox 计算与 Monte Carlo 仿真项目' },
  { id: 'gn-2', label: 'Daniel Gottesman 经典量子纠错论文', type: 'paper', entryId: 'e-paper-correction', description: 'Gottesman 1997 纠错码群论开山论文' },
  { id: 'gn-3', label: '稳定子计算结果 Schema 定义', type: 'data_item', entryId: 'e-data-stabilizer-schema', description: 'v0.2 格式 Schema 与关系表规约' },
  { id: 'gn-4', label: '量子计算项目商业价值摘要', type: 'business_value', entryId: 'e-business-quantum-value', description: 'ROI 320%、节约 45.2万算力、衍生专利看板' },
  { id: 'gn-5', label: '稳定子算法知识与工具调用服务', type: 'service', entryId: 'e-stabilizer-service-entry', description: 'RAG、MCP工具、MiQi可调用服务三合一卡片' },
  { id: 'gn-6', label: '项目复盘报告标准模板', type: 'template', entryId: 'e-template-retrospective', description: 'QA 发布的官方项目成果总结 Word 模板 v1.3' },
  { id: 'gn-7', label: 'AI 驱动实验分析能力', type: 'concept', entryId: 'e-ai-data-analysis', description: '微观纪元领先的 AI 语义提取与知识图谱架构' }
];

// Mock Knowledge Graph Edges
export const mockGraphEdges: KnowledgeGraphEdge[] = [
  { id: 'ge-1', source: 'gn-1', target: 'gn-2', relation: 'references', description: '项目物理配置和仿真算法引用了此文献' },
  { id: 'ge-2', source: 'gn-1', target: 'gn-3', relation: 'produces', description: '实验数据输出符合此 Schema 规范' },
  { id: 'ge-1-6', source: 'gn-1', target: 'gn-6', relation: 'belongs_to', description: '项目成果采用此官方复盘模板进行归档' },
  { id: 'ge-3', source: 'gn-1', target: 'gn-4', relation: 'derived_from', description: '计算成果转换为了可衡量的商业投资价值' },
  { id: 'ge-4', source: 'gn-1', target: 'gn-5', relation: 'implemented_as', description: '项目的数据和算子被打包封装为三种 AI 知识调用服务' },
  { id: 'ge-5', source: 'gn-5', target: 'gn-7', relation: 'callable_by', description: '调用服务由微观纪元的 AI 图谱语义中台提供底层赋能' },
  { id: 'ge-6', source: 'gn-2', target: 'gn-7', relation: 'related_to', description: '前沿物理学术论文是 AI 数据理解与分析的基础语料' }
];

// Mock AI Preloaded QA Q&A for demo query page
export interface MockQA {
  id: string;
  question: string;
  answer: string;
  references: Reference[];
}

export const mockQAData: MockQA[] = [
  {
    id: 'qa-1',
    question: '什么是稳定子算法？它是如何进行纠错的？',
    answer: '稳定子群论（Stabilizer Formalism）由 Daniel Gottesman 于 1997 年提出。它通过引入泡利群的阿贝尔子群来描述量子态和纠错线路。在物理实现中，描述大尺度纠错芯片需要指数级的复振幅态向量。而稳定子算法通过存储和代数运算群的 $n-k$ 个发生器，将量子纠错的运算复杂度降低至多项式级别，极大地简化了错误综合征的提取。微观纪元 Sandbox 项目对稳定子算法进行 Monte Carlo 模拟，有效找出了噪声阈值。',
    references: [
      {
        id: 'ref-qa-1',
        fromEntryId: 'e-stabilizer-project',
        toEntryId: 'e-paper-correction',
        locator: 'section=Introduction to Stabilizer Formalism',
        quote: 'A stabilizer code is defined as the joint +1-eigenspace of an abelian subgroup of the Pauli group.',
        referenceType: 'paper',
        title: 'Quantum Error Correction with Stabilizer Codes (Gottesman, 1997)',
        updatedAt: '2026-05-15'
      }
    ]
  },
  {
    id: 'qa-2',
    question: '稳定子算法 Sandbox 计算项目 (SB-8849-QC) 取得了哪些关键计算结果？',
    answer: '在物理泡利缺陷概率从 $10^{-4}$ 到 $10^{-1}$ 的 Monte Carlo 拟合中，该 Sandbox 项目对 $10^7$ 次错误进行了抽取。结果显示，当比特距离为 $3$ 时，纠错后的伪阈值（Pseudo-threshold）落在 $p_0 \\approx 0.015$（即 1.5% 左右）。在物理错误率低于 1.5% 时，使用稳定子编码纠错后的逻辑比特保真度能够明显提升。',
    references: [
      {
        id: 'ref-qa-2-1',
        fromEntryId: 'e-stabilizer-project',
        locator: 'section=2. 计算核心结果',
        quote: '零错保真度 (Zero-error Fidelity): 比特数 d=3 时，伪阈值点约为 0.0152',
        referenceType: 'markdown_chunk',
        title: '《稳定子算法计算说明.md》 (来自 stabilizer_project_result.pdf)',
        updatedAt: '2026-06-30'
      }
    ]
  },
  {
    id: 'qa-3',
    question: '该量子纠错项目的商业转化价值与算力开销节省是多少？',
    answer: '由于稳定子算法不需要进行全态保真度的矩阵连乘，模拟耗时下降了 90% 以上。在 Monte Carlo 运行过程中，累计为平台节省了约 45.2 万元的算力租赁开销。此外，项目衍生出了 2 项核心发明专利，并为 MiQi 智能助手、MCP 插件和 RAG 工具链提供了现成的工具库，ROI 预估达到 320%。',
    references: [
      {
        id: 'ref-qa-3-1',
        fromEntryId: 'e-business-quantum-value',
        locator: 'section=商业价值论证',
        quote: '降低了近 90% 的计算成本，累计节约开销约 45.2 万元。ROI看板显示预估 320%。',
        referenceType: 'sandbox_result',
        title: '量子计算项目商业价值摘要 (ROI看板)',
        updatedAt: '2026-06-30'
      }
    ]
  }
];

// Helper to filter entries based on visibility and user login state
export function getAuthorizedEntries(isLoggedIn: boolean): WikiEntry[] {
  if (isLoggedIn) {
    return mockEntries;
  }
  return mockEntries.filter(entry => entry.visibility === 'public');
}
