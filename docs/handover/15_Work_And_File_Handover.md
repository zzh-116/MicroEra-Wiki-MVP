# 15 — 工作内容与文件交接（Work & File Handover）

- 日期：2026-10-26
- 移交方：AI 开发组（离职人员） → 接手人 / Platform Team
- 性质：离职交接单——说明「做了什么」与「东西在哪」，配合 `14_Final_Handover_Notes.md`（剩余事项）一起读

> 本文件不含任何密码、JWT、完整 `DATABASE_URL` 或客户数据正文。

---

## 一、项目概况

**MiqroEra Wiki MVP（微观纪元内部知识库）**：面向材料 / 造纸 / 生物炼制方向的内部研究资料检索与 AI 问答系统（RAG）。核心能力是把 PDF/DOCX/PPTX/XLSX/图片等研究资料解析入库，向量化检索，并用本地 LLM 基于检索结果回答。

| 层 | 技术栈 |
|----|--------|
| 前端 | React 19 + Vite + TypeScript + Tailwind CSS 4（`src/`） |
| 后端 | Express 4 + TypeScript（`backend/` + `server/` 装配） |
| 数据库 | PostgreSQL 16 + pgvector（Docker `pgvector/pgvector:pg16`，宿主端口 5433） |
| ORM | Drizzle ORM（22 项迁移） |
| 模型 | Ollama 本地：`bge-m3`（嵌入，1024 维）+ `qwen2.5:7b`（对话） |
| 解析 | Docling 2.111.0（Python 3.12，经 `DOCLING_CMD`/`DOCLING_PYTHON` 调用） |
| 认证 | JWT（HS256）+ bcrypt；角色 admin / editor / viewer |

## 二、工作内容（做了什么）

### 2.1 交付成果（关键数字）

| 指标 | 结果 |
|------|------|
| 操作 parity（对标 WeKnora 冻结规范） | **162/162** 必需操作，三面（REST/CLI/MCP）对齐 |
| 能力得分 | **86/100**（41 项必须能力全过；10 项 stretch 诚实 blocked） |
| 全量测试 | **692/692** 通过，0 失败 0 跳过（67 文件） |
| 类型检查 | 前端 + 后端 `tsc --noEmit` **0 错误** |
| 数据库迁移 | **22 项**（0000–0021，含 pgvector、授权列、document_images、current_parse_job_id） |
| 知识条目 | **328 条有效条目**（345 含软删除），本地 2324 条图谱关系 |

### 2.2 功能模块

- **知识库**：KB/Source/Document/Revision 域模型 + CRUD + 文件夹 + 版本/回滚 + 导出/导入。
- **文档解析**：PDF/DOCX/PPTX/XLSX/图片 OCR 统一转 Markdown；持久化解析队列（租约/fencing、DLQ、取消/重试）；布局感知分块（标题/表格/图片）。
- **检索**：BGE-M3 向量（pgvector）+ 词法 BM25（Postgres FTS）+ 混合 RRF + rerank + 元数据过滤 + 评估集（recall@k/MRR/nDCG）。
- **AI 问答**：grounded Q&A + 会话/消息/引用/流式（SSE），基于检索结果回答并标注来源。
- **Wiki 生成**：检索命中确定性合成摘要 + 来源/链接/图谱。
- **Agent**：多步 retrieve→answer + 工具/MCP/skills/sandbox + 对象级归属校验。
- **数据源连接器**：arXiv、CrossRef、Feishu（缺凭据）、Sandbox、本地导入。
- **模型/任务管理**：模型注册、任务仪表盘。
- **安全**：SSRF 防护（单次 DNS + 钉住 + default-deny）、MCP HTTP JWT 鉴权、图片归属/越权防护、对象级 IDOR 修复、operation 角色授权。

### 2.3 工作阶段（时间线）

1. **P0**：项目骨架 + 安全加固 + operation registry + contracts + CLI/MCP 骨架。
2. **P1–P2**：知识库域模型；解析适配器 + 持久化解析队列 + 分块。
3. **P3**：检索（向量 bugfix → BM25 → RRF → rerank → 过滤 → 评估）。
4. **P4–P6**：chat / wiki / agent。
5. **P7–P9**：数据源、模型注册、任务仪表盘、api/mcp/cli introspection（parity 162/162）。
6. **P10**：收尾（迁移 DR 演练 + 向量修复 + 覆盖率/基线文档）。
7. **内容导入**：328 条有效条目入库 + 条目-文件关联审计（`analysis-output/`）。
8. **缺陷修复**：29 缺陷分 A–E 批修复回归（`docs/parity/defect-audit.md`）。
9. **安全复审**：B-1/B-2/B-4 独立复审 PASS（2026-10-22）。
10. **本地演示验收**：独立演示环境（3002 单端口 + `miqroera_demo`）API 层全过（2026-10-19/22）。
11. **Git 交付打包 + 历史清理**：提交至 `handover/final` + `git filter-repo` 清除敏感历史（2026-10-26）。

## 三、文件交接（东西在哪）

### 3.1 仓库位置

- 本机：`C:\Users\CAIHUI\MiqroEra-Wiki-MVP-new`
- 分支：`handover/final`（交付分支）、`main`、`release/v1.0`、`fix/graph-node-label-toggle`、`backup-before-filter`（HEAD 以 `git log` 为准）
- 远程（已移除，待重加）：`origin` = `https://github.com/zzh-116/MicroEra-Wiki-MVP.git`；`gitlab` = `git.miqroera.com`（NUC 轮询源）

### 3.2 目录结构

| 目录/文件 | 用途 | 状态 |
|-----------|------|------|
| `backend/` | Express 后端核心（config/middleware/repositories/services/parser/db/schema + 22 迁移） | ✅ 入库 |
| `server/` | 装配层（`app.ts`、`worker.ts`、中间件 `auth`/`operation-auth`、路由 v2 + legacy） | ✅ 入库 |
| `packages/` | `operation-registry`（授权映射）+ `mcp`（stdio/http + 鉴权 + 工具过滤） | ✅ 入库 |
| `src/` | 前端 React/TS | ✅ 入库 |
| `cli/` | `microera` CLI | ✅ 入库 |
| `tests/` | Vitest，67 文件 / 692 用例 | ✅ 入库 |
| `scripts/` | 部署、NUC 自动部署、验收证据生成脚本 | ✅ 入库 |
| `docs/` | `handover/` 01–15 + `parity/` 验收/审计报告 | ✅ 入库（`testlogs`/`history` 忽略） |
| `api/` | 遗留 API 目录（17 文件，Vercel 相关） | ✅ 入库 |
| `public/` | 静态资源 | ✅ 入库 |
| `analysis-output/` | 数据审计/迁移脚本（80M，含 UCL 镜像 SQL + 审计 JSON） | ⚠️ **入库**（见 §4） |
| `META-INF/` | Spring Boot 遗留（1 文件 MANIFEST） | ✅ 入库 |
| `dist/` | 前端构建产物 | ⏭️ 忽略（`npm run build` 生成） |
| `node_modules/` | 依赖 | ⏭️ 忽略 |
| `backend/data/` | 运行时数据 **1.4G**（客户研究原件：zaozhi/laiguanxue/reports/images…） | ⏭️ 忽略（保留在磁盘） |
| `backend/data-demo/` | 演示环境数据 | ⏭️ 忽略 |
| `BOOT-INF/` | Spring Boot 遗留（含真实 DB/SMTP 凭据配置） | ⏭️ 忽略（磁盘残留 100K） |
| `logs/`、`*.log` | 日志 | ⏭️ 忽略 |
| `wiki-audit/` | 审计草稿 | 🔒 未跟踪（不入库） |

### 3.3 根目录关键文件

- `README.md`（项目说明）、`.env.example`（环境变量模板，已脱敏）、`.gitignore`、`.mcp.json`
- `package.json`（脚本）、`requirements.txt`（Docling 依赖）、`docker-compose.yml`（PG+pgvector）、`Dockerfile`
- `tsconfig.json` / `tsconfig.backend.json` / `vite.config.ts` / `vitest.config.ts` / `drizzle.config.ts`
- `CHANGELOG.md`（变更记录）、`CONTENT_PROGRESS.md`（内容进度，32 待办）
- `start.ps1`、`vercel.json`、`metadata.json`

### 3.4 数据与运行环境

| 资源 | 位置/说明 |
|------|-----------|
| 数据库 | Docker `microera-postgres`（PG16+pgvector @5433）；库：`microera_wiki`（开发）、`miqroera_demo`（演示）、`microera_wiki_test`（测试） |
| Ollama | `http://localhost:11434`，模型 `bge-m3` + `qwen2.5:7b` |
| Docling | 2.111.0（Python 3.12，默认 python 是 3.15 不支持，须设 `DOCLING_CMD`/`DOCLING_PYTHON`） |
| 端口 | 前端 dev 3000、后端 3001、演示单端口 3002（SERVE_STATIC） |
| 凭据 | feishu 缺真实 app_id/app_secret；管理员演示账号为运行时 bootstrap 强随机生成（不记录） |

### 3.5 文档索引

- **交接文档** `docs/handover/01–15`：01 概览 / 02 架构 / 03 部署 / 04 硬件 / 05 Docker / 06 环境变量 / 07 模型 / 08 API / 09 运维 / 10 故障 / 11 NUC / 12 Docling / 13 本地演示验收 / 14 最终交接备注 / **15 工作内容与文件交接**。
- **验收报告** `docs/parity/`：`final-delivery-acceptance-2026-10-22.md`（最终交付）、`final-report.md`（86/100）、`acceptance-audit.md`、`defect-audit.md`、`coverage-report.md`、`disaster-recovery.md`、`commit-ledger.md` 等。

## 四、敏感 / 遗留项（接手人需决策）

| 项 | 现状 | 建议 |
|----|------|------|
| **`analysis-output/`（80M）** | ⚠️ **仍被 git 跟踪**，已确认含客户数据：`mirror-ucl-sync*.sql`（2×38M，105 条 INSERT 写入 entries/document_chunks/vectors/tags）+ 审计 JSON（audit-local/ucl、local-vs-ucl、entry-file-audit）。本轮历史清理**未纳入**，push 时会一并泄露 | **本轮决定：暂不清理**。push 前必须连同历史清理，否则泄露客户数据 |
| `backend/data/`（1.4G） | 客户研究原件，已 gitignore、保留在磁盘 | 按需保留（供接手/演示）或删除 |
| `BOOT-INF/`、`META-INF/` | Spring Boot 遗留；BOOT-INF 已 ignore，META-INF 仍 1 文件入库 | 可删磁盘残留；META-INF 一并移出 git |
| `api/`（17 文件） | 遗留目录，用途待确认（Vercel 相关） | 确认是否仍需，否则清理 |
| 验收证据 SHA | `state.json`/`report.json`/`commit-ledger.md` 引用重写前 SHA | 按新历史重新生成/注明 |

## 五、接手人下一步（详见 `14_Final_Handover_Notes.md`）

1. 浏览器 UI 人工验收（正式验收硬前置）。
2. 决定 `analysis-output/` 等 §4 遗留项去留。
3. 重新校准验收证据 SHA。
4. 补 feishu 凭据 + 真实集成 E2E。
5. F2 Job 后端统一（需授权）。
6. push 交付：重加 remotes → force-push → NUC 重新 clone。
7. 补齐 10 项 stretch 能力。
