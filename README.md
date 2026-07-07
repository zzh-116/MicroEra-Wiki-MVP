# 微观纪元 Wiki (MicroEra Wiki MVP)

企业知识资产目录与轻量化 Wiki 平台，集成**企业数据源管道**：多格式导入 → 统一解析 → 智能分块 → 向量嵌入 → 语义检索 → RAG 问答。

## 企业数据源架构

```
      ┌──────────────────────────────────────────────────┐
      │  Sandbox API │ PDF │ Word │ Markdown │ TXT │ PNG  │
      └──────────────────────┬───────────────────────────┘
                             │
                             ▼
                   Data Import Service
              （Upload / API / Batch Import）
                             │
                             ▼
                      Parser Service
                （MarkItDown → 统一 Markdown）
                             │
                             ▼
                    Document Service
            （Markdown + Metadata 管理）
                             │
                             ▼
                      Chunk Service
                 （4 种分块策略）
                             │
                             ▼
                   Embedding Service
               （默认 BGE-M3，本地 Ollama）
                             │
                             ▼
                      Milvus Vector DB
                   （自动降级 → Memory）
                             │
                             ▼
                    Retrieval Service
            （Embedding → TopK → Context）
                             │
                             ▼
                    LLM Service（Ollama）
                （默认 Qwen / DeepSeek）
                             │
                             ▼
                     Express REST API
                             │
                             ▼
                  Swagger / Postman Demo
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 |
| 后端 | Express 4 (薄路由) + TypeScript (tsx) |
| AI 对话 | qwen2.5:7b / deepseek-r1:8b via Ollama |
| Embedding | bge-m3 (1024d) via Ollama（可切换 nomic-embed-text） |
| 向量存储 | Milvus（可选） → Memory Cosine（默认） → Keyword（兜底） |
| 文档解析 | MarkItDown 概念：pdf-parse / mammoth / 原生 Markdown |
| 认证 | JWT (Node crypto) |
| 数据 | JSON 文件 (backend/data/) |

## 功能

### 平台功能
- **公开首页** — 产品/技术/专利展示，免登录
- **资产目录** — 多条件筛选（类型/可见度/分类/标签），网格/表格双视图
- **内部登录** — JWT 认证，公开/内部内容隔离
- **条目编辑器** — Markdown 编辑 + 文件附件
- **宣发素材库** — PPT/图片/流程图管理，用途分类
- **研发数据对准** — DataItem Schema 对齐表格
- **管理员专区** — 统计仪表盘
- **中英双语** + **深色/浅色主题**

### 企业数据管道

| 步骤 | 功能 | 实现 |
|------|------|------|
| 1. Import | 文件上传 / API 提交 / 目录批量导入 | `backend/import/service.ts` |
| 2. Parse | MarkItDown：PDF/Word/MD/TXT/PNG → 统一 Markdown | `backend/parser/service.ts` |
| 3. Document | Markdown + 元数据 CRUD | `backend/document/store.ts` |
| 4. Chunk | 4 种策略：fixed / paragraph / sentence / markdown-aware | `backend/chunk/service.ts` |
| 5. Embed | BGE-M3 向量化（1024d），本地 Ollama | `backend/embedding/ollama.ts` |
| 6. Vector | Milvus IVF_FLAT / 内存余弦相似度，JSON 持久化 | `backend/vector/` |
| 7. Retrieve | 语义搜索：Embedding → TopK → Context（三级降级） | `backend/retrieval/search.ts` |
| 8. LLM | RAG 问答 + AI 摘要，Ollama 本地推理 | `backend/ai/service.ts` |

### AI 功能

| 功能 | 流程 | 模型 |
|------|------|------|
| 语义搜索 | query → embed → vector cosine → ranked results | bge-m3 |
| RAG 问答 | question → retrieve top-3 → build context → LLM answer + sources | qwen2.5:7b |
| AI 摘要 | entry → LLM → 2-3 sentence summary | qwen2.5:7b |
| 数据导入 | file → parse → metadata → chunk → embed → vector store | Pipeline |

## 前置条件

- **Node.js** ≥ 18
- **Ollama** + 以下模型：

```bash
# 嵌入模型（必需）
ollama pull bge-m3              # 推荐，1024d
ollama pull nomic-embed-text    # 备选，768d

# 对话模型（必需）
ollama pull qwen2.5:7b          # 推荐
ollama pull deepseek-r1:8b      # 备选

# 视觉模型（可选，图片 OCR）
ollama pull llava:latest
```

- **Milvus**（可选，自动降级到内存向量库）：

```bash
docker run -d --name milvus -p 19530:19530 -p 9091:9091 milvusdb/milvus:latest
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local

# 3. 开发模式（两个终端）
npm run dev            # Vite :3000
npm run server:dev     # Express :3001

# 4. 仅 API 模式
npm run backend        # Express :3001 (不含前端)

# 5. 导入材料性质数据
curl -X POST http://localhost:3001/api/pipeline/import/string \
  -H "Content-Type: application/json" \
  -d '{"content":"# 材料性质数据\n\n## 1.1 几何结构\n\n| # | 中文名称 | 英文名称 | 符号 | 定义 | 首选单位 |\n|---|---------|---------|------|------|----------|\n| C01 | 可及表面积 | Accessible Surface Area | ASA | 探针分子可接触的材料表面积 | m²/g |","fileName":"material.md","metadata":{"title":"材料性质数据","entry_type":"data_item","visibility":"internal","tags":["材料性质","MOF"]}}'

# 6. 测试语义搜索
curl -X POST http://localhost:3001/api/pipeline/search \
  -H "Content-Type: application/json" \
  -d '{"query":"MOF 材料的可及表面积","topK":5}'

# 7. 测试 RAG 问答
curl -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"公司的材料计算平台有哪些核心特性？"}'
```

## 生产构建

```bash
npm run build          # Vite → dist/
npm run server         # Express serve dist/ + API → http://localhost:3001
npm run backend        # 仅 API → http://localhost:3001
```

## 测试账号

| 用户名 | 密码 | 权限 |
|--------|------|------|
| admin | admin123 | 内部用户（查看/编辑所有内容） |

访客无需登录，只能查看 `public` 条目。

## API 端点

### 📊 Pipeline（企业数据管道）

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/api/pipeline/health` | 管道健康检查（Ollama/Milvus 状态、支持格式） |
| `GET` | `/api/pipeline/formats` | 列出支持的输入格式及其说明 |
| `GET` | `/api/pipeline/status` | 管道状态摘要（条目数、向量库、模型配置） |
| `POST` | `/api/pipeline/parse` | Step 1 — MarkItDown 解析（PDF/Word/MD/TXT → Markdown） |
| `POST` | `/api/pipeline/chunk` | Step 2 — 智能分块（4 种策略可配） |
| `POST` | `/api/pipeline/embed` | Step 3 — 向量嵌入 + 存入向量库 |
| `POST` | `/api/pipeline/import` | **完整管道**（multipart 文件上传 或 JSON body） |
| `POST` | `/api/pipeline/import/string` | 完整管道（字符串内容） |
| `POST` | `/api/pipeline/import/batch` | 批量导入（扫描目录） |
| `POST` | `/api/pipeline/search` | 语义搜索（Embedding → TopK → Context） |

### 🤖 AI

| Method | Path | 输入 | 输出 |
|--------|------|------|------|
| `POST` | `/api/ai/search` | `{query}` | `{results[], source}` |
| `POST` | `/api/ai/chat` | `{question, history}` | `{answer, sources[]}` |
| `POST` | `/api/ai/summarize` | `{entryId}` | `{summary}` |
| `POST` | `/api/ai/import` | `{filePath \| content}` | `{entryIds[], propertyCount}` |
| `POST` | `/api/ai/reset` | `{filePath}` | 清空导入数据 + 重新导入 |

### 🔐 Auth

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `POST` | `/api/auth/login` | — | 登录，返回 JWT |
| `GET` | `/api/auth/me` | Bearer | 当前用户 |

### 📝 Entries / Categories / Tags / Files / DataItems

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| `GET` | `/api/entries` | optional | 列表 (?keyword/type/visibility/category/tag) |
| `GET` `/POST` `/PUT` `/DELETE` | `/api/entries/:id` | Bearer | 详情/创建/更新/删除（级联） |
| `GET` | `/api/categories` | — | 分类列表 |
| `GET` | `/api/tags` | — | 标签列表 |
| `GET` `/POST` `/DELETE` | `/api/files` | optional | 文件列表/上传/删除 |
| `GET` `/PUT` `/DELETE` | `/api/data-items` | Bearer | DataItem CRUD |

## API 文档

- **Swagger UI**: http://localhost:3001/api/docs
- **OpenAPI Spec**: `backend/swagger/openapi.json`
- **Postman Collection**: `backend/postman/Enterprise-Data-Pipeline.postman_collection.json`

## 项目结构

```
├── backend/                          # 核心业务逻辑（框架无关）
│   ├── config.ts                     # 集中配置
│   ├── types.ts                      # 共享类型定义
│   ├── app.ts                        # Express App 工厂
│   ├── main.ts                       # 独立 API 入口
│   ├── import/
│   │   └── service.ts                # Data Import Service（Upload/API/Batch）
│   ├── parser/
│   │   ├── markdown.ts               # Markdown 表格解析器（材料性质）
│   │   └── service.ts                # MarkItDown 多格式解析（PDF/Word/MD/TXT/PNG）
│   ├── document/
│   │   └── store.ts                  # Document Service（Markdown + Metadata 管理）
│   ├── chunk/
│   │   └── service.ts                # Chunk Service（fixed/paragraph/sentence/markdown）
│   ├── embedding/
│   │   └── ollama.ts                 # Embedding Service（BGE-M3 / nomic-embed-text）
│   ├── vector/
│   │   ├── memory.ts                 # 内存余弦相似度（默认，JSON 持久化）
│   │   └── milvus.ts                 # Milvus adapter（可选，IVF_FLAT + COSINE）
│   ├── retrieval/
│   │   └── search.ts                 # Retrieval Service（Embedding → TopK → Context）
│   ├── metadata/
│   │   ├── store.ts                  # Entry/Category/Tag/File/DataItem CRUD
│   │   └── importJob.ts              # 材料性质导入管道编排
│   ├── ai/
│   │   ├── service.ts                # LLM Service（RAG Chat / 摘要）
│   │   └── prompts.ts                # Prompt 模板
│   ├── swagger/
│   │   ├── openapi.json              # OpenAPI 3.0 规范
│   │   └── swagger.html              # Swagger UI 页面
│   ├── postman/
│   │   └── Enterprise-Data-Pipeline.postman_collection.json
│   └── data/                         # 运行时数据（不提交 Git）
│       ├── metadata/                 # entries.json, categories.json, tags.json, files.json
│       ├── documents/                # entry_N.json（文档块）
│       ├── vectors.json              # 内存向量存储
│       └── materials-metadata.md     # 源数据文件（169 个材料性质属性）
│
├── server/                           # Express 薄层
│   ├── index.ts                      # 入口（CORS / 静态服务 / 启动引导）
│   ├── middleware/
│   │   └── auth.ts                   # JWT 中间件（sign / verify / requireAuth）
│   └── routes/
│       ├── auth.ts                   # POST /login, GET /me
│       ├── entries.ts                # Entry CRUD（可见度过滤）
│       ├── categories.ts             # GET 分类
│       ├── tags.ts                   # GET 标签
│       ├── files.ts                  # File CRUD
│       ├── dataItems.ts              # DataItem CRUD
│       ├── ai.ts                     # AI search / chat / summarize / import / reset
│       └── pipeline.ts               # Pipeline parse / chunk / embed / import / search
│
├── src/                              # React 前端
│   ├── App.tsx                       # SPA 路由（state-based）
│   ├── main.tsx                      # React 入口
│   ├── api/                          # API 客户端层
│   │   ├── client.ts                 # fetch 封装（JWT 自动附带）
│   │   ├── authApi.ts                # 登录 API
│   │   ├── entriesApi.ts             # Entry CRUD API
│   │   └── ...
│   ├── components/                   # UI 组件
│   │   ├── AiChatWidget.tsx          # RAG 问答浮窗
│   │   ├── AiSearchToggle.tsx        # AI 语义搜索开关
│   │   ├── AiSearchResults.tsx       # AI 搜索结果展示
│   │   ├── AiSummarizeButton.tsx     # AI 摘要按钮
│   │   ├── EntryCard.tsx             # 条目卡片
│   │   ├── EntryTable.tsx            # 条目表格
│   │   ├── FilterBar.tsx             # 多维筛选栏
│   │   ├── FileUpload.tsx            # 文件上传
│   │   ├── Navbar.tsx                # 顶部导航
│   │   └── ...
│   ├── context/                      # React Context
│   │   ├── AuthContext.tsx            # 认证状态
│   │   ├── AiContext.tsx             # AI 状态
│   │   └── LanguageThemeContext.tsx  # 双语 + 主题
│   ├── pages/                        # 页面
│   │   ├── PublicHome.tsx            # 公开首页
│   │   ├── LoginPage.tsx             # 登录页
│   │   ├── EntryListPage.tsx         # 条目目录
│   │   ├── EntryDetailPage.tsx       # 条目详情
│   │   ├── EntryEditorPage.tsx       # 条目编辑器
│   │   ├── AssetLibraryPage.tsx      # 宣发素材库
│   │   ├── DataItemPage.tsx          # 研发数据对准
│   │   └── AdminMockPage.tsx         # 管理员面板
│   └── types/                        # 前端类型定义
│
├── .env.example                      # 环境变量模板
├── vite.config.ts                    # Vite 配置（Tailwind + React + API 代理）
├── tsconfig.json                     # TypeScript 配置
└── package.json
```

## 管道三级降级策略

```
语义搜索请求
  │
  ├─ 1. Milvus (IVF_FLAT + COSINE)
  │     └─ 失败/不可用 →
  │
  ├─ 2. Memory Vector Store (余弦相似度，JSON 持久化)
  │     └─ 无向量数据 →
  │
  └─ 3. Keyword Search (标题×10 + 摘要×5 + 标签×3 + 内容×2)
```

## 环境变量

```env
# Server
PORT=3001
JWT_SECRET=your-random-secret

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-r1:8b          # 默认 LLM
OLLAMA_CHAT_MODEL=qwen2.5:7b         # RAG 对话模型
OLLAMA_EMBED_MODEL=bge-m3            # 嵌入模型（1024d）

# Milvus（可选）
MILVUS_HOST=localhost
MILVUS_PORT=19530
MILVUS_COLLECTION=wiki_entries
EMBEDDING_DIM=1024

# 数据目录
DATA_DIR=./backend/data

# 前端开发
VITE_API_BASE_URL=http://localhost:3001
```
