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
                   pgvector (PostgreSQL)
              （IVFFlat 索引，余弦相似度）
                             │
                             ▼
                    Retrieval Service
            （Embedding → TopK → Context）
                             │
                             ▼
                    LLM Provider (SSE 流式)
        （Ollama / OpenAI / DeepSeek 可切换）
                             │
                             ▼
                     Express REST API
                             │
                             ▼
                  Swagger / React 前端
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 |
| 后端 | Express 4 + TypeScript (tsx) |
| 数据库 | PostgreSQL 16 + pgvector (Drizzle ORM) |
| AI 对话 | qwen2.5:7b / deepseek-r1:8b via Ollama（SSE 流式） |
| Embedding | bge-m3 (1024d) via Ollama |
| 向量存储 | pgvector (PostgreSQL) |
| LLM 抽象 | Provider 模式（Ollama / OpenAI / DeepSeek 可切换） |
| 文档解析 | MarkItDown：pdf-parse / mammoth / 原生 Markdown |
| 认证 | JWT + bcrypt (PostgreSQL users 表) |

## 功能

### 平台功能
- **公开首页** — 产品/技术/专利展示，免登录
- **资产目录** — 多条件筛选（类型/可见度/分类/标签），网格/表格双视图
- **内部登录** — JWT 认证 + bcrypt 密码哈希，公开/内部内容隔离
- **条目编辑器** — Markdown 编辑 + 文件附件
- **宣发素材库** — PPT/图片/流程图管理，用途分类
- **研发数据对准** — DataItem Schema 对齐表格
- **管理员专区** — 统计仪表盘
- **中英双语** + **深色/浅色主题**

### 企业数据管道

| 步骤 | 功能 | 实现 |
|------|------|------|
| 1. Import | 文件上传 / API 提交 / 目录批量导入 | `backend/services/import.service.ts` |
| 2. Parse | MarkItDown：PDF/Word/MD/TXT/PNG → 统一 Markdown | `backend/parser/service.ts` |
| 3. Chunk | 4 种策略：fixed / paragraph / sentence / markdown-aware | `backend/chunk/service.ts` |
| 4. Embed | BGE-M3 向量化（1024d），本地 Ollama | `backend/embedding/ollama.ts` |
| 5. Vector | pgvector 存储 + IVFFlat 索引 | `backend/repositories/vector.repository.ts` |
| 6. Retrieve | 语义搜索：Embedding → TopK → Context | `backend/services/search.service.ts` |
| 7. LLM | RAG 流式问答 + AI 摘要，Provider 抽象层 | `backend/services/ai.service.ts` |

### AI 功能

| 功能 | 流程 | 模型 |
|------|------|------|
| 语义搜索 | query → embed → pgvector cosine → ranked results | bge-m3 |
| RAG 问答（非流式） | question → retrieve top-5 → build context → LLM answer | qwen2.5:7b |
| RAG 问答（SSE 流式） | question → retrieve top-5 → build context → token 级实时生成 | qwen2.5:7b |
| AI 摘要 | entry → LLM → 2-3 sentence summary | qwen2.5:7b |
| 数据导入 | file → parse → metadata → chunk → embed → vector store | Pipeline |

## 前置条件

- **Node.js** ≥ 18
- **Docker**（运行 PostgreSQL）
- **Ollama** + 以下模型：

```bash
# 嵌入模型（必需）
ollama pull bge-m3              # 推荐，1024d
ollama pull nomic-embed-text    # 备选，768d

# 对话模型（必需）
ollama pull qwen2.5:7b          # 推荐
ollama pull deepseek-r1:8b      # 备选
```

- **PostgreSQL**（Docker 一键启动）：

```bash
docker compose up -d             # 启动 PostgreSQL 16 + pgvector
```

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env

# 3. 启动 PostgreSQL
docker compose up -d

# 4. 启动 Ollama 并拉取模型
ollama pull bge-m3
ollama pull qwen2.5:7b

# 5. 开发模式（两个终端）
npm run backend        # Express API :3001（自动 migrate + seed）
npm run dev            # Vite 前端 :3000

# 6. 测试 RAG 问答（非流式）
curl -X POST http://localhost:3001/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"公司的材料计算平台有哪些核心特性？"}'

# 7. 测试 SSE 流式问答
curl -N -X POST http://localhost:3001/api/ai/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"question":"什么是量子计算材料设计？"}'

# 8. 测试语义搜索
curl -X POST http://localhost:3001/api/pipeline/search \
  -H "Content-Type: application/json" \
  -d '{"query":"MOF 材料的可及表面积","topK":5}'
```

## 生产构建

```bash
npm run build          # Vite → dist/
npm run server         # Express serve dist/ + API → http://localhost:3001
npm run backend        # 仅 API → http://localhost:3001
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

| Method | Path | 输入 | 输出 | 说明 |
|--------|------|------|------|------|
| `POST` | `/api/ai/search` | `{query}` | `{results[], source}` | 语义搜索 |
| `POST` | `/api/ai/chat` | `{question, conversationId?}` | `{answer, sources[], conversationId}` | 非流式 RAG 问答 |
| `POST` | `/api/ai/chat/stream` | `{question, conversationId?}` | SSE 事件流 | **流式 RAG 问答**（token 级实时生成） |
| `POST` | `/api/ai/summarize` | `{entryId}` | `{summary}` | AI 摘要 |
| `GET` | `/api/ai/conversations` | — | 对话列表 | 当前用户的对话历史 |
| `GET` | `/api/ai/conversations/:id` | — | 消息列表 | 指定对话的完整消息 |
| `POST` | `/api/ai/import` | `{filePath \| content}` | `{entryIds[], propertyCount}` | 数据导入 |
| `POST` | `/api/ai/reset` | `{filePath}` | 清空导入数据 + 重新导入 | 重置管道 |

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
│   ├── app.ts                        # Express App 工厂（auto-migrate + seed）
│   ├── main.ts                       # 独立 API 入口
│   │
│   ├── db/                           # 数据库层
│   │   ├── connection.ts             # PostgreSQL 连接池 + Drizzle 实例
│   │   ├── schema.ts                 # 11 张表的 Drizzle schema 定义
│   │   ├── migrate.ts                # 迁移执行器
│   │   ├── seed.ts                   # 初始数据填充（admin 用户 + 条目）
│   │   └── migrations/               # 自动生成的 SQL 迁移文件
│   │
│   ├── repositories/                 # Repository 层（数据访问）
│   │   ├── base.ts                   # 抽象 BaseRepository
│   │   ├── entry.repository.ts       # 条目 CRUD + 搜索
│   │   ├── category.repository.ts    # 分类查询
│   │   ├── tag.repository.ts         # 标签 CRUD + 关联
│   │   ├── user.repository.ts        # 用户 + bcrypt 认证
│   │   ├── file.repository.ts        # 文件元数据
│   │   ├── data-item.repository.ts   # DataItem CRUD
│   │   ├── chunk.repository.ts       # 文档分块持久化
│   │   ├── conversation.repository.ts # 对话历史
│   │   └── vector.repository.ts      # pgvector 向量存储
│   │
│   ├── services/                     # Service 层（业务逻辑）
│   │   ├── auth.service.ts           # 认证服务（替换硬编码 admin）
│   │   ├── search.service.ts         # 语义 + 关键词检索
│   │   ├── ai.service.ts             # RAG 问答（流式 + 非流式）
│   │   └── import.service.ts         # 数据导入管道（事务安全）
│   │
│   ├── llm/                          # LLM Provider 抽象层（新增）
│   │   ├── types.ts                  # LLMProvider 接口 + StreamChunk 类型
│   │   ├── ollama.provider.ts        # Ollama 实现（流式 + 非流式）
│   │   ├── sse.ts                    # SSE 工具函数
│   │   └── index.ts                  # Provider 工厂
│   │
│   ├── parser/
│   │   ├── markdown.ts               # Markdown 表格解析器
│   │   └── service.ts                # MarkItDown 多格式解析
│   ├── chunk/
│   │   └── service.ts                # 分块服务（4 种策略）
│   ├── embedding/
│   │   └── ollama.ts                 # BGE-M3 嵌入
│   ├── ai/
│   │   └── prompts.ts                # Prompt 模板
│   ├── swagger/                      # OpenAPI + Swagger UI
│   └── data/                         # 运行时数据
│       └── materials-metadata.md     # 源数据（169 个材料性质属性）
│
├── server/                           # Express 薄路由层
│   ├── index.ts                      # 入口
│   ├── middleware/
│   │   └── auth.ts                   # JWT 中间件
│   └── routes/
│       ├── auth.ts                   # /api/auth/login, /me
│       ├── entries.ts                # /api/entries CRUD
│       ├── ai.ts                     # /api/ai/chat, /chat/stream, /summarize, /conversations
│       └── pipeline.ts               # /api/pipeline/*
│
├── src/                              # React 前端
│   ├── api/
│   │   └── queryApi.ts              # askAI() + askAIStream() SSE 流式
│   └── pages/
│       └── AIQueryPage.tsx          # 流式问答页面（token 级实时显示 + 停止按钮）
│
├── docker-compose.yml                # PostgreSQL 16 + pgvector
├── drizzle.config.ts                 # Drizzle Kit 配置
├── .env.example                      # 环境变量模板
└── package.json
```

## 管道架构（Service → Repository → PostgreSQL）

```
Service 层                    Repository 层               Database
───────────                  ──────────────              ────────
auth.service.ts      →       user.repository.ts      →   users
ai.service.ts        →       conversation.repository  →   conversations, chat_messages
ai.service.ts        →       entry.repository.ts      →   entries, entry_tags
search.service.ts    →       vector.repository.ts     →   vectors (pgvector)
import.service.ts    →       entry + chunk repos      →   entries, document_chunks
```

## LLM Provider 抽象

```
AiService
    │ streamChat() / chat()
    ▼
LLMProvider (interface)
    │ streamChat() → AsyncGenerator<StreamChunk>
    │ chat()       → Promise<string>
    ▼
├── OllamaProvider   (当前)  — Ollama /v1/chat/completions
├── OpenAIProvider   (未来)  — api.openai.com
├── DeepSeekProvider (未来)  — api.deepseek.com
└── ...
```

添加新 Provider 只需实现 `LLMProvider` 接口，不改任何业务代码。

## 搜索策略

```
语义搜索请求
  │
  ├─ 1. pgvector (IVFFlat + Cosine Distance)
  │     └─ 主搜索：Embedding → TopK → Context
  │
  └─ 2. Keyword Search (标题×10 + 摘要×5 + 标签×3 + 内容×2)
        └─ 兜底：无向量数据或 pgvector 不可用时
```

## 环境变量

```env
# Server
PORT=3001
JWT_SECRET=your-random-secret

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/microera_wiki

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen2.5:7b         # RAG 对话模型
OLLAMA_EMBED_MODEL=bge-m3            # 嵌入模型（1024d）

# 前端开发
VITE_API_BASE_URL=http://localhost:3001
```
