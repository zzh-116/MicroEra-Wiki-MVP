# 01 — 项目概览 (Project Overview)

> **目标读者**: 全员
> **阅读时间**: 10 分钟

---

## 1.1 项目介绍

**MicroEra Wiki MVP** 是一个面向企业科研场景的智能知识库系统。
它能够：

- 导入多种格式的科研文档（PDF、DOCX、PPTX、Markdown、图片等）
- 自动解析文档内容，提取结构化属性
- 将文档分块（Chunk）并生成向量嵌入（Embedding）
- 存入向量数据库（pgvector / Milvus）支持语义检索
- 基于 RAG（检索增强生成）架构，结合 LLM 提供溯源级智能问答
- 提供 Web 前端进行知识浏览、搜索和管理

### 核心功能

| 功能模块 | 说明 |
|----------|------|
| 文档导入 | 支持文件上传、API 提交、批量目录导入 |
| 文献检索导入 | arXiv + CrossRef 双源文献搜索，一键导入知识库 |
| 文档解析 | Docling 引擎解析 PDF/DOCX/PPTX 等格式为 Markdown |
| 智能分块 | Markdown-aware 分块策略（fixed/paragraph/sentence/markdown） |
| 向量嵌入 | Ollama `bge-m3` 模型，1024 维向量 |
| 语义搜索 | pgvector 向量检索 + 关键词混合检索（Hybrid Search） |
| RAG 问答 | 流式 SSE 输出，多轮对话 |
| 知识图谱 | 基于标签共享关系的可视化图谱 |
| 权限管理 | JWT 认证，public/internal 可见度控制 |
| Sandbox 连接器 | 对接外部 Sandbox 数据平台自动同步 |
| 学术连接器 | arXiv 预印本 + CrossRef 150M+ 学术文献 |

---

## 1.2 项目目标

- 为企业科研团队提供统一的**知识检索与问答平台**
- 将非结构化文档（PDF、论文、实验数据）转化为**可检索、可溯源的结构化知识**
- 利用 RAG 架构让 LLM 的回答**基于真实文档，降低幻觉**
- 支持**私有化部署**，保障企业数据安全

---

## 1.3 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| **前端** | React | 19.x |
| | Vite | 6.x |
| | Tailwind CSS | 4.x |
| | React Router | 6.x |
| | Lucide React（图标） | - |
| | Motion（动画） | - |
| **后端** | Express.js | 4.x |
| | TypeScript | 5.8 |
| | tsx（运行时） | 4.x |
| **数据库** | PostgreSQL | 16 |
| | pgvector 扩展 | - |
| | Drizzle ORM | 0.45 |
| **向量数据库** | pgvector（主） | - |
| | Milvus（可选） | - |
| **LLM** | Ollama（本地） | latest |
| | DeepSeek API（云端） | v1 |
| **Embedding** | bge-m3（via Ollama） | - |
| **文档解析** | Docling（Python CLI） | latest |
| **认证** | JWT（HS256） | - |

---

## 1.4 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                       Frontend                          │
│              React 19 + Vite + Tailwind                 │
│                    Port: 3000 (dev)                      │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/SSE (port 3001 proxy)
┌────────────────────▼────────────────────────────────────┐
│                   Express Server                        │
│                    Port: 3001                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Auth    │ │  Search  │ │  AI RAG  │ │ Pipeline  │  │
│  │  Router  │ │  Router  │ │  Router  │ │  Router   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┬────────────────┐
     ▼               ▼               ▼                ▼
┌─────────┐  ┌────────────┐  ┌───────────┐  ┌──────────────┐
│PostgreSQL│  │  Ollama    │  │  Docling  │  │  DeepSeek    │
│+pgvector│  │ (LLM+Embed)│  │  (Parser) │  │  (Cloud LLM) │
└─────────┘  └────────────┘  └───────────┘  └──────────────┘
```

---

## 1.5 数据流

```
企业数据源 (arXiv / CrossRef / PDF / DOCX / PPTX / MD / Sandbox)
    │
    ▼
[1. Import]  上传文件 → Docling 解析 → 提取 Markdown + 属性
    │
    ▼
[2. Chunk]   按 Markdown 结构分块（512-1024 字符/块，64-128 字符重叠）
    │
    ▼
[3. Embed]   bge-m3 生成 1024 维向量
    │
    ▼
[4. Store]   向量写入 pgvector（Milvus 可选）
    │
    ▼
[5. Search]  用户查询 → 向量化 → 语义搜索 + 关键词搜索 → 混合排序
    │
    ▼
[6. RAG]     检索结果 + 用户问题 → LLM → 流式 SSE 输出
```

---

## 1.6 目录结构

```
MicroEra-Wiki-MVP/
├── backend/                  # 后端核心逻辑
│   ├── ai/                   # AI Prompt 模板
│   │   └── prompts.ts
│   ├── app.ts                # Express App 工厂
│   ├── chunk/                # 文档分块服务
│   │   └── service.ts        # 4 种分块策略
│   ├── config.ts             # 集中配置（环境变量读取）
│   ├── connectors/           # 外部系统连接器（Sandbox / arXiv / CrossRef / Feishu）
│   │   ├── registry.ts       # 连接器注册表
│   │   ├── types.ts          # 连接器类型定义
│   │   ├── sandbox/          # Sandbox 平台连接器
│   │   ├── arxiv/            # arXiv 预印本（Atom XML 解析）
│   │   ├── crossref/         # CrossRef 学术文献（DOI/标题搜索）
│   │   └── feishu/           # 飞书文档连接器
│   ├── db/                   # 数据库
│   │   ├── connection.ts     # PostgreSQL 连接池
│   │   ├── migrate.ts        # 迁移任务
│   │   ├── migrations/       # SQL 迁移文件
│   │   ├── schema.ts         # Drizzle ORM Schema
│   │   └── seed.ts           # 种子数据
│   ├── embedding/            # 向量嵌入
│   │   └── ollama.ts         # Ollama Embedding (bge-m3)
│   ├── llm/                  # LLM Provider
│   │   ├── index.ts          # Provider 工厂
│   │   ├── types.ts          # 统一 LLM 接口
│   │   ├── ollama.provider.ts
│   │   ├── deepseek.provider.ts
│   │   └── sse.ts            # SSE 响应工具
│   ├── main.ts               # 后端独立入口
│   ├── parser/               # 文档解析器
│   │   ├── base.ts           # 解析器抽象接口
│   │   ├── docling.ts        # Docling 实现
│   │   ├── factory.ts        # 解析器注册工厂
│   │   ├── markdown.ts       # Markdown 回退解析器
│   │   ├── models.ts         # 解析结果模型
│   │   └── types.ts          # 类型导出
│   ├── repositories/         # 数据访问层
│   │   ├── base.ts           # 基础 Repository
│   │   ├── category.repository.ts
│   │   ├── chunk.repository.ts
│   │   ├── conversation.repository.ts
│   │   ├── entry.repository.ts
│   │   ├── file.repository.ts
│   │   ├── tag.repository.ts
│   │   ├── user.repository.ts
│   │   └── vector.repository.ts
│   ├── services/             # 业务服务层
│   │   ├── ai.service.ts     # AI 聊天 / RAG 流式服务
│   │   ├── auth.service.ts   # 认证服务
│   │   ├── import.service.ts # 导入管道服务
│   │   └── search.service.ts # 搜索服务（混合检索）
│   ├── types.ts              # 共享类型定义
│   └── vector/               # Milvus 向量数据库
│       └── milvus.ts
├── server/                   # Express 服务层
│   ├── index.ts              # 服务入口（含前端 SPA）
│   ├── middleware/
│   │   └── auth.ts           # JWT 认证中间件
│   └── routes/               # API 路由
│       ├── ai.ts             # /api/ai/*
│       ├── auth.ts           # /api/auth/*
│       ├── categories.ts     # /api/categories/*
│       ├── connectors.ts     # /api/connectors/*
│       ├── dataItems.ts      # /api/data-items/*
│       ├── entries.ts        # /api/entries/*
│       ├── files.ts          # /api/files/*
│       ├── graph.ts          # /api/graph/*
│       ├── pipeline.ts       # /api/pipeline/*
│       ├── search.ts         # /api/search/*
│       ├── spaces.ts         # /api/spaces/*
│       └── tags.ts           # /api/tags/*
├── src/                      # 前端源码
│   ├── api/                  # API 调用层
│   ├── components/           # React 组件（19 个）
│   ├── context/              # React Context（Auth）
│   ├── mock/                 # Mock 数据
│   ├── pages/                # 页面组件（19 个页面）
│   ├── types/                # TypeScript 类型
│   └── utils/                # 工具函数
├── api/                      # Vercel Serverless API（兼容层）
├── docs/
│   └── handover/             # ← 本文档目录
├── public/                   # 静态资源
├── docker-compose.yml        # PostgreSQL + pgvector
├── package.json              # Node 依赖 + 脚本
├── vite.config.ts            # Vite 配置
├── tsconfig.json             # TypeScript 配置
├── drizzle.config.ts         # Drizzle ORM 配置
├── .env.example              # 环境变量模板
├── start.ps1                 # Windows 启动脚本
└── README.md                 # 项目 README
```

---

## 1.7 开发语言

| 语言 | 用途 | 占比 |
|------|------|------|
| TypeScript | 全栈（前端 + 后端） | ~95% |
| SQL | 数据库迁移 | ~3% |
| PowerShell | Windows 启动脚本 | ~1% |
| Shell | 容器命令 | ~1% |

---

## 1.8 运行流程

### 启动流程

```
1. Docker Compose 启动 PostgreSQL + pgvector (port 5432)
2. npm run server 启动 Express API (port 3001)
   ├── 连接 PostgreSQL
   ├── 运行数据库迁移（自动）
   ├── 执行种子数据（幂等）
   ├── 创建管理员用户（幂等）
   ├── 预热 Embedding 模型（bge-m3）
   └── 监听 HTTP 请求
3. npm run dev 启动 Vite 前端 (port 3000)
   └── API 请求代理到 port 3001
```

### AI 查询流程

```
1. 用户在前端输入问题
2. POST /api/ai/chat/stream (SSE)
3. 服务端：
   a. 获取对话历史（如有 conversationId）
   b. 查询向量化 → 语义搜索 pgvector
   c. 关键词搜索补充结果（混合检索）
   d. 构建 RAG Prompt（系统提示词 + 检索到的文档块 + 用户问题）
   e. 调用 LLM（Ollama 或 DeepSeek）流式生成
   f. 通过 SSE 逐 token 推送给前端
4. 前端流式渲染，用户看到逐字输出
```

### 文档导入流程

```
1. 用户上传文件 或 API 提交内容
2. Docling 解析 → 提取 Markdown 文本
3. Markdown-aware 分块（按标题结构）
4. Ollama bge-m3 生成 1024 维向量
5. 分块文本 → document_chunks 表
6. 向量 → vectors 表（pgvector）
7. 返回导入结果（解析耗时、分块数、向量数）
```
