# 微观纪元 Wiki (MicroEra Wiki MVP)

企业知识资产目录与 AI 知识平台，集成**企业数据源管道** + **Knowledge Parsing Layer** + **多轮 RAG 问答**：多格式导入 → 统一解析 → 知识标准化 → 分块嵌入 → 混合检索 → 多轮 RAG 问答。

## 企业数据源架构

```
     ┌─────────────────────────────────────────────────────┐
     │          Data Sources                              │
     │  Sandbox  │  PDF  │  Word  │  Markdown  │  TXT  │  PNG  │
     └──────────┬──────────────────┬────────────────────────┘
                │                  │
                ▼                  ▼
        Connector Layer      Parser (Docling)
        (结构化数据)          (非结构化文档)
                │                  │
                ▼                  ▼
     ┌──────────────────────────────────────────────┐
     │       Knowledge Parsing Layer                │
     │  Parser → Resolver → Formatter → Markdown    │
     │  (统一 ViewModel, ID 解析, 去 [object Object]) │
     └──────────────────────┬───────────────────────┘
                            │
                            ▼
                   Chunk Service
                 (4 种分块策略)
                            │
                            ▼
                Embedding Service
              (BGE-M3, 本地 Ollama)
                            │
                            ▼
                pgvector (PostgreSQL)
              (IVFFlat 索引, 余弦相似度)
                            │
                            ▼
                Retrieval Service
           (向量 + 关键词混合检索)
                            │
                            ▼
                LLM Provider (SSE 流式)
             (Ollama / DeepSeek 可切换)
                            │
                            ▼
          Multi-turn RAG Conversation
        (对话历史 + RAG Context → LLM)
                            │
                            ▼
                Express REST API
                            │
                            ▼
              React Router SPA 前端
           (ViewModel 驱动, 卡片化渲染)
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + React Router v6 |
| 后端 | Express 4 + TypeScript (tsx) |
| 数据库 | PostgreSQL 16 + pgvector (Drizzle ORM) |
| AI 对话 | qwen2.5:7b / deepseek-v4-flash via Ollama（SSE 流式） / DeepSeek API |
| Embedding | bge-m3 (1024d) via Ollama |
| 向量存储 | pgvector (PostgreSQL)，Milvus 可选 |
| LLM 抽象 | Provider 模式（Ollama / DeepSeek 热切换） |
| 文档解析 | Docling CLI：PDF / DOCX / PPTX / XLSX / HTML / 图片 (OCR) |
| 认证 | JWT (HS256) + bcrypt |
| 容器化 | Docker + Docker Compose（Alpine 多阶段构建） |

## 功能

### 平台功能
- **React Router SPA** — 14 条路由，URL 导航、浏览器历史、深链接、返回按钮、面包屑
- **公开首页** — 产品/技术/专利展示，免登录
- **内部首页** — 最近更新、星标收藏、AI 快速问答
- **知识索引** — 多条件筛选（类型/可见度/分类），分页展示
- **条目详情** — ViewModel 驱动的卡片化渲染 + 知识图谱 + 版本历史 + 多轮 AI 问答
- **Knowledge Parsing Layer** — Sandbox JSON → 统一 ViewModel → 结构化卡片（不再渲染原始 JSON）
- **多轮 RAG 对话** — 每个条目独立对话历史，上下文追问，SSE 流式输出
- **内部登录** — JWT 认证 + bcrypt 密码哈希，公开/内部内容隔离
- **管理后台** — 条目元数据清单、在线编辑、版本快照备份、分页浏览、一键重建 Embedding
- **认证守卫** — 受保护路由自动重定向到登录页，登录后返回原页面

### 企业数据管道

| 步骤 | 功能 | 实现 |
|------|------|------|
| Connect | Sandbox API 连接器（Token 认证 + 自动刷新） | `backend/connectors/sandbox/` |
| Import | 文件上传 / API 提交 / Connector 同步 / 目录批量导入 | `backend/services/import.service.ts` |
| Parse | Docling：PDF/Word/PPT/Excel/HTML/MD/TXT/图片(OCR) → 统一 Markdown | `backend/parser/docling.ts` |
| Chunk | 4 种策略：fixed / paragraph / sentence / markdown-aware | `backend/chunk/service.ts` |
| Embed | BGE-M3 向量化（1024d），本地 Ollama | `backend/embedding/ollama.ts` |
| Vector | pgvector 存储 + IVFFlat 索引 | `backend/repositories/vector.repository.ts` |
| Retrieve | 语义搜索：Embedding → TopK → Context | `backend/services/search.service.ts` |
| LLM | RAG 流式问答 + AI 摘要，Provider 抽象层 | `backend/services/ai.service.ts` |

### Sandbox 数据连接器 + Knowledge Parsing Layer

Sandbox 作为结构化数据源接入 Wiki，经四层 Knowledge Parsing 处理：

```
Sandbox REST API (Bearer Token)
    │  POST /api/login
    │  GET  /api/da/asset/project-select
    │  POST /api/da/asset/page          ← 分页循环拉取
    │  GET  /api/da/asset/operator/:id  ← 按类型取详情
    ▼
┌──────────────────────────────────────────────────┐
│         Knowledge Parsing Layer                  │
│                                                  │
│  KnowledgeParser   →  Sandbox JSON → Document   │
│  ReferenceResolver →  ID → 可读名称              │
│  PropertyFormatter →  防 [object Object]         │
│  MarkdownGenerator →  统一嵌入优化 Markdown       │
└──────────────────┬───────────────────────────────┘
                   ▼
         importFromConnector() → Entry → Chunk → Embed → pgvector
                   │
                   ▼
         前端 ViewModel → 卡片化渲染
         (MetadataCard / RecordCard / ReferenceView)
```

- **可插拔架构** — `ConnectorRegistry` 模式，后续 Feishu/Confluence/Notion 只需注册新 Connector
- **增量同步** — 基于 `updateTime` + `lastSyncTime` 持久化
- **智能标题** — 从 `name` / `originalName` / `description` 自动生成可读标题
- **Knowledge Layer** — 禁止前端直接渲染 Sandbox 原始 JSON，所有数据经 formatter 转 ViewModel
- **优雅降级** — 未解析的 ID 不显示，UUID/ObjectId 自动过滤

### AI 功能

| 功能 | 流程 | 模型 |
|------|------|------|
| 语义搜索 | query → embed → pgvector cosine + keyword → 混合排序 | bge-m3 |
| RAG 问答（非流式） | question → retrieve top-10 → build context → LLM | qwen2.5:7b / deepseek-v4-flash |
| RAG 问答（SSE 流式） | question → retrieve top-10 → context → token 级实时生成 | qwen2.5:7b / deepseek-v4-flash |
| **多轮 RAG 对话** | conversationId → history + retrieve → context → LLM | qwen2.5:7b / deepseek-v4-flash |
| AI 摘要 | entry → LLM → 2-3 sentence summary | qwen2.5:7b / deepseek-v4-flash |
| 数据导入 | file → parse → metadata → chunk → embed → vector store | Pipeline |
| **一键重建 Embedding** | 清空向量 → 遍历条目 → 重新分块 → 批量嵌入 → 写入 pgvector | bge-m3 |

### LLM Provider 热切换

通过 `.env` 中 `LLM_PROVIDER` 一键切换：
- `ollama` — 本地 Ollama（完全离线，需 GPU）
- `deepseek` — DeepSeek 云端 API（无需 GPU，需 API Key）

两种 Provider 实现统一接口，应用层零代码改动。

## 前置条件

- **Node.js** ≥ 22
- **Docker** + **Docker Compose v2**（运行 PostgreSQL）
- **Ollama** + 以下模型：

```bash
# 嵌入模型（必需）
ollama pull bge-m3              # 1024d，~2GB

# 对话模型（如果 LLM_PROVIDER=ollama）
ollama pull qwen2.5:7b          # 推荐，~4.7GB
# 或使用 DeepSeek 云端 API（无需本地 GPU）
```

- **PostgreSQL**（Docker 一键启动）：

```bash
docker compose up -d postgres    # 仅数据库
docker compose up -d             # 全栈（含 app 容器）
```

- **Docling**（文档解析，可选）：

```bash
pip install docling              # PDF/Word/PPT/Excel/图片解析
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env：至少配置 JWT_SECRET, LLM_PROVIDER, DEEPSEEK_API_KEY（如用云端）

# 3. 启动 PostgreSQL
docker compose up -d postgres

# 4. 启动 Ollama 并拉取模型
ollama pull bge-m3
ollama pull qwen2.5:7b

# 5. 开发模式（两个终端）
npm run server:dev    # Express API :3001（自动 migrate + seed，热重载）
npm run dev            # Vite 前端 :3000（热重载）

# 6. 访问
# 前端: http://localhost:3000
# 健康检查: http://localhost:3001/api/pipeline/health

# 7. 同步 Sandbox 数据
curl -X POST http://localhost:3001/api/connectors/sandbox/sync \
  -H "Content-Type: application/json" \
  -d '{"projectId":"155"}'

# 8. 测试语义搜索
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"MOF 材料的可及表面积"}'

# 9. 测试 RAG 问答（SSE 流式）
curl -N -X POST http://localhost:3001/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"question":"什么是量子计算材料设计？"}'
```

## 生产构建

```bash
# 方式 A: 本地构建
npm run build          # Vite → dist/
npm run server         # Express serve dist/ + API → http://localhost:3001

# 方式 B: Docker 全栈部署
docker compose up -d   # PostgreSQL + App 容器 → http://localhost:3001
```

## 数据库管理

```bash
npm run db:migrate     # 运行数据库迁移
npm run db:seed        # 填充初始数据
npm run db:generate    # 根据 schema.ts 生成迁移 SQL
npm run db:studio      # 启动 Drizzle Studio（可视化数据库管理）
```

首次启动 `npm run backend` 会自动执行 migrate + seed，无需手动操作。

## 测试账号

| 用户名 | 密码 | 权限 |
|--------|------|------|
| admin | admin123 | 管理员（查看/编辑所有内容） |

密码使用 bcrypt 哈希存储在 PostgreSQL `users` 表中。访客无需登录，只能查看 `public` 条目。

## API 端点

### 🔌 Connectors（数据源连接器）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/connectors/health` | 连接器健康检查 + 已注册列表 |
| `GET` | `/api/connectors` | 列出所有已注册连接器 |
| `POST` | `/api/connectors/:name/connect` | 连接/认证 |
| `GET` | `/api/connectors/:name/documents` | 列出文档（?projectId/keyword/type） |
| `GET` | `/api/connectors/:name/documents/:id` | 获取文档详情 |
| `POST` | `/api/connectors/:name/sync/preview` | 预览同步 |
| `POST` | `/api/connectors/:name/sync` | 完整同步 → Entry → Chunk → Embed |
| `GET` | `/api/connectors/sandbox/projects` | Sandbox 项目列表 |
| `GET` | `/api/connectors/sandbox/last-sync` | 上次同步时间 |

### 📊 Pipeline（企业数据管道）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/pipeline/health` | 管道健康检查 |
| `GET` | `/api/pipeline/formats` | 支持的输入格式 |
| `GET` | `/api/pipeline/status` | 管道状态（条目数/模型配置） |
| `POST` | `/api/pipeline/parse` | Docling 解析（PDF/Word/PPT/Excel → Markdown） |
| `POST` | `/api/pipeline/chunk` | 智能分块（4 种策略可配） |
| `POST` | `/api/pipeline/embed` | 向量嵌入 |
| `POST` | `/api/pipeline/import` | 完整管道（multipart 文件上传） |
| `POST` | `/api/pipeline/import/string` | 完整管道（字符串内容） |
| `POST` | `/api/pipeline/import/batch` | 批量导入（扫描目录） |
| `POST` | `/api/pipeline/search` | 语义搜索 |

### 🔍 Search

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/search` | 关键词/类型搜索（支持分页 `page`/`pageSize`，空查询回退 DB） |

### 🤖 AI

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/api/ai/chat` | 非流式 RAG 问答 |
| `POST` | `/api/ai/chat/stream` | **流式 RAG 问答**（SSE） |
| `POST` | `/api/ai/summarize` | AI 摘要 |
| `GET` | `/api/ai/conversations` | 对话历史列表 |
| `GET` | `/api/ai/conversations/:id` | 对话详情 |

### 🔐 Auth / 📝 Entries / Categories / Tags / Files / DataItems

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `POST` | `/api/auth/login` | — | 登录 |
| `GET` | `/api/auth/me` | Bearer | 当前用户 |
| `GET` | `/api/entries` | optional | 列表（?page/pageSize/keyword/type/visibility/category/tag） |
| `GET` `/POST` `/PUT` `/DELETE` | `/api/entries/:id` | Bearer | 条目 CRUD |
| `GET` | `/api/categories` | — | 分类列表 |
| `GET` | `/api/tags` | — | 标签列表 |
| `GET` `/POST` `/DELETE` | `/api/files` | optional | 文件管理 |
| `GET` `/PUT` `/DELETE` | `/api/data-items` | Bearer | DataItem CRUD |

### 🗺️ Graph / Spaces / Admin

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `GET` | `/api/graph/global` | optional | 全量知识图谱 |
| `GET` | `/api/graph/focused?entryId=` | optional | 以条目为中心的子图 |
| `GET` | `/api/spaces` | — | 知识空间列表 |
| `GET` | `/api/admin/stats` | Bearer | 管理统计（条目数/模型配置） |
| `POST` | `/api/admin/rebuild-embeddings` | Bearer | 一键重建所有向量嵌入 |

## 项目结构

```
├── backend/                          # 核心业务逻辑
│   ├── config.ts                     # 集中配置（含 Sandbox 连接参数）
│   ├── types.ts                      # 共享类型定义
│   ├── app.ts                        # Express App 工厂
│   ├── main.ts                       # 独立 API 入口
│   │
│   ├── connectors/                   # 数据源连接器层（可插拔）
│   │   ├── types.ts                  # Connector 接口 + Unified Document Model
│   │   ├── registry.ts               # ConnectorRegistry（同 ParserFactory 模式）
│   │   ├── index.ts                  # 公共导出
│   │   └── sandbox/                  # Sandbox 连接器
│   │       ├── types.ts              # Sandbox API 响应类型
│   │       ├── auth.ts               # Token 登录 + 自动刷新
│   │       ├── client.ts             # HTTP Client（全部 API 封装）
│   │       ├── assets.ts             # 分页循环拉取
│   │       ├── detail.ts             # 按类型路由详情
│   │       ├── markdown.ts           # JSON → Markdown + getDisplayTitle()
│   │       ├── sync.ts               # 全量/增量同步
│   │       ├── index.ts              # SandboxConnector 实现
│   │       └── knowledge/            # 🆕 Knowledge Parsing Layer
│   │           ├── types.ts          # KnowledgeDocument 类型
│   │           ├── parser.ts         # Sandbox JSON → KnowledgeDocument
│   │           ├── resolver.ts       # ID 解析（UUID → 可读名称）
│   │           ├── formatter.ts      # 属性格式化（防 [object Object]）
│   │           ├── markdown.ts       # 统一 Markdown 生成器
│   │           └── index.ts          # 统一导出
│   │
│   ├── db/                           # 数据库层
│   │   ├── connection.ts             # PostgreSQL + Drizzle
│   │   ├── schema.ts                 # Drizzle schema（entries/categories/tags/vectors/...）
│   │   ├── migrate.ts / seed.ts      # 迁移 + 种子数据
│   │   └── migrations/               # SQL 迁移文件
│   │
│   ├── repositories/                 # Repository 层
│   │   ├── entry.repository.ts       # 条目 CRUD + 分页搜索
│   │   ├── vector.repository.ts      # pgvector 向量存储
│   │   └── ...                       # category/tag/user/file/chunk/conversation
│   │
│   ├── services/                     # Service 层
│   │   ├── auth.service.ts           # JWT 认证
│   │   ├── search.service.ts         # 语义 + 关键词检索
│   │   ├── ai.service.ts             # RAG 问答
│   │   └── import.service.ts         # 数据导入管道（含 importFromConnector）
│   │
│   ├── parser/                       # 文档解析
│   │   ├── base.ts                   # DocumentParser 接口
│   │   ├── factory.ts                # ParserFactory（可插拔）
│   │   ├── docling.ts                # Docling CLI 解析器
│   │   ├── models.ts                 # ParseResult 等类型
│   │   └── markdown.ts               # Markdown 属性提取
│   │
│   ├── chunk/service.ts              # 分块服务（4 种策略）
│   ├── embedding/ollama.ts           # BGE-M3 嵌入
│   ├── llm/                          # LLM Provider 抽象
│   └── data/                         # 运行时数据
│
├── server/                           # Express 路由层
│   ├── middleware/auth.ts            # JWT 中间件（requireAuth / optionalAuth）
│   └── routes/
│       ├── connectors.ts             # /api/connectors/*
│       ├── admin.ts                  # 🆕 /api/admin/*（重建 Embedding 等）
│       ├── search.ts                 # /api/search
│       ├── pipeline.ts               # /api/pipeline/*
│       ├── ai.ts                     # /api/ai/*
│       ├── auth.ts                   # /api/auth/*
│       ├── graph.ts                  # /api/graph/*
│       └── entries.ts / files.ts / ... # CRUD 路由
│
├── src/                              # React 前端（React Router SPA）
│   ├── router/index.tsx              # 路由配置（14 routes + 404）
│   ├── layouts/AppLayout.tsx         # 统一布局（TopNav + Sidebar + Outlet + Footer）
│   ├── hooks/
│   │   └── useConversation.ts        # 🆕 多轮对话状态管理
│   ├── types/
│   │   └── viewModels.ts             # 🆕 UI ViewModel 类型定义
│   ├── utils/
│   │   ├── sandboxFormatter.ts       # 🆕 Sandbox JSON → ViewModel
│   │   └── knowledgeFormatter.ts     # 🆕 Entry → DetailViewModel
│   ├── components/
│   │   ├── Pagination.tsx            # 统一分页组件
│   │   ├── ProtectedRoute.tsx        # 认证守卫
│   │   ├── MetadataCard.tsx          # 🆕 基本信息卡片
│   │   ├── RecordCard.tsx            # 🆕 数据记录卡片
│   │   ├── ReferenceView.tsx         # 🆕 参考文献列表
│   │   ├── ExpandableContent.tsx     # 🆕 折叠/展开正文
│   │   ├── ConversationPanel.tsx     # 🆕 多轮对话面板
│   │   ├── ChatInput.tsx             # 🆕 聊天输入框
│   │   ├── MessageBubble.tsx         # 🆕 聊天气泡
│   │   ├── KnowledgeCard.tsx         # 🆕 知识卡片组件
│   │   └── TopNav.tsx / WikiSidebar.tsx / Footer.tsx / ...
│   ├── pages/
│   │   ├── HomePage.tsx              # 认证条件首页路由
│   │   ├── EntryDetailPage.tsx       # 详情页包装
│   │   ├── NotFoundPage.tsx          # 404 页面
│   │   ├── KnowledgeEntryPage.tsx    # 🆕 ViewModel 驱动的详情页
│   │   ├── SandboxProjectPage.tsx    # 🆕 Sandbox 项目详情页
│   │   └── SearchPage.tsx / AIQueryPage.tsx / ...
│   └── api/                          # API Client
│
├── Dockerfile                        # 🆕 多阶段构建（Alpine）
├── docker-compose.yml                # PostgreSQL + App 容器
├── docs/handover/                    # 🆕 平台组 Handover 文档（10 篇）
└── package.json
```

## 路由一览

| Path | Page | Auth |
|---|---|---|
| `/` | HomePage (auth-conditional) | public |
| `/login` | LoginPage | guest |
| `/search` | SearchPage | public |
| `/entry/:id` | EntryDetailPage (← 返回按钮) | public |
| `/ai-query` | AIQueryPage | public |
| `/graph` | KnowledgeGraphPage | public |
| `/system-version` | SystemVersionPage | public |
| `/papers` | PaperLibraryPage | protected |
| `/data-items` | DataItemPage | protected |
| `/templates` | TemplateLibraryPage | protected |
| `/business-value` | BusinessValuePage | protected |
| `/admin/import` | AdminImportPage | protected |
| `/admin/manage` | AdminContentManagePage | protected |
| `*` | NotFoundPage (404) | — |

## 环境变量

```env
# Server
PORT=3001
JWT_SECRET=your-random-secret

# LLM Provider 选择
LLM_PROVIDER=ollama                # ollama（本地）| deepseek（云端）

# Ollama（LLM_PROVIDER=ollama 时使用）
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen2.5:7b
OLLAMA_EMBED_MODEL=bge-m3

# DeepSeek（LLM_PROVIDER=deepseek 时使用）
DEEPSEEK_API_KEY=sk-xxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-v4-flash

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/microera_wiki

# Sandbox 数据源
SANDBOX_BASE_URL=http://139.196.211.120:6810
SANDBOX_USERNAME=admin
SANDBOX_PASSWORD=123456

# 向量数据库
EMBEDDING_DIM=1024
MILVUS_HOST=localhost               # 可选
MILVUS_PORT=19530                   # 可选

# 数据
DATA_DIR=./backend/data

# 前端开发
VITE_API_BASE_URL=http://localhost:3001
```

完整环境变量说明见 [Handover 文档](docs/handover/06_Environment_Variables.md)。
