# MicroEra Wiki × WeKnora 80% — 基线审计（P0 输入）

计划包：`MicroEra-WeKnora-80-Plan.zip`（Planning v1.0, 2026-10-09）
参考冻结：WeKnora `602d0c388bf17d894f467fe0cd65d1d62c73d303`；MicroEra `4bd5bf417df090351b91de205e6b34a457eb47a2`
本地 HEAD：`01343a2`（`4bd5bf4` 已在历史中，基线快照存在）

## 环境（2026-10-09 实测）
- Node 22.14.0、npm 10.9.2（无 pnpm，仓库用 `package-lock.json`）
- Docker 29.6.1 + Compose v5.3.0；`microera-postgres`(pgvector/pg16) 于宿主 `:5433`
- Ollama 0.32.14：`bge-m3`(embedding/1024d)、`qwen2.5:7b`(chat)、`llava` 已就绪
- 参考 WeKnora 全栈本地运行（app:8080 / postgres:5432 / docreader / redis / frontend:80）
- 数据库实测：entries=345（internal=336, public=9, soft-deleted=17）、users=1(admin)、vectors=2638

## 基线健康度
- `npm run typecheck:backend` ✅ 通过
- `npm test` ✅ 107/107 通过（10 个测试文件）
- 未发现未提交的用户改动（`git status --short` 仅 `?? wiki-audit/`，属用户目录，未触碰）

## 架构事实（源码核对，非 README）
- 入口：`server/index.ts` → `backend/app.ts`（Express 工厂，挂 14 组路由）→ `server/routes/*`
- 数据：`backend/db/schema.ts`（Drizzle），已有 `users/categories/tags/entries/entry_tags/wiki_files/data_items/document_chunks/vectors/conversations/chat_messages/bookmarks/run_logs/entry_relations`
- 检索：`backend/services/search.service.ts`（语义+关键词）→ `backend/repositories/vector.repository.ts`（pgvector）
- RAG：`backend/services/ai.service.ts` → `backend/llm/*`（Ollama/DeepSeek provider）
- 解析：`backend/parser/*`；分块 `backend/chunk/service.ts`；连接器 `backend/connectors/{sandbox,arxiv,crossref,feishu}`
- 图：`backend/services/graph-rebuild.service.ts`（semantic_related 边，**非** AutoWiki）

## P0 缺陷（已定位，修复见 P0 提交）
| # | 位置 | 问题 | 严重度 |
|---|---|---|---|
| 1 | `server/routes/ai.ts:133` `POST /api/ai/reset` | 无鉴权，删除条目/chunk/vector | 严重 |
| 2 | `server/routes/ai.ts:119` `POST /api/ai/import` | 无鉴权，任意 `filePath` 导入 | 严重 |
| 3 | `server/routes/pipeline.ts` parse/import/batch | `parseFile(filePath)`/`readFileSync(filePath)` 任意服务端路径，无鉴权 | 严重 |
| 4 | `backend/services/ai.service.ts:59` | `buildRagMessages` 硬编码 `semanticSearch(question, true, …)`，匿名 RAG 泄漏内部内容 | 严重 |
| 5 | `backend/services/search.service.ts:88` | 向量检索 visibility 在 JS 后置过滤（非 SQL 下沉） | 高 |
| 6 | `server/routes/ai.ts:114` | `GET /api/ai/conversations/:id` 无归属校验，任意读会话 | 高 |
| 7 | `server/middleware/auth.ts:5` + `backend/config.ts:6` | JWT 默认 secret 两处硬编码（`microera-wiki-mvp-secret-2026`） | 高 |
| 8 | `backend/db/seed.ts:100` + `user.repository.ts:66` | 默认 admin `admin123` | 高 |
| 9 | `server/routes/admin.ts:18` | `requireAuth` 无 role 校验，任意登录用户可 `rebuild-embeddings`(清空向量)/删日志 | 高 |
| 10 | `backend/repositories/vector.repository.ts` | 检索 SQL 无 visibility 过滤（`ALLOWED_ENTRY_TYPES` 白名单不含可见性） | 高 |

> 注：计划包 `02_BASELINE_AND_REFERENCES.md` 提到的 `DISTINCT ON(title) ORDER BY title` 全局 TopK 缺陷，本地代码已修复（`vector.repository.ts` 现为直接 `orderBy(distance).limit(topK)`）；`server/routes/ai.ts` 的 `reset` 逻辑仍在。

## 首阶段（P0）目标
1. 修复上表全部缺陷（含 golden/回归测试）。
2. 建立 Operation Registry + CLI/MCP 骨架（`packages/`、`cli/`）。
3. 落地 `npm run parity:check`（诚实输出当前 0 分）。
4. 全部本地 commit，不 push。
