# Phase 1 纯文本 Worker — 最终实现设计（D1–D4）

- 日期：2026-10-13
- 状态：**已实现并通过开发侧验证**（Phase 0 队列/fencing/Worker 骨架 → Phase 1 纯文本处理器 + 原子提交）。
- 前提：Phase 0 已就绪（`parse-worker-2b-phase0-selfreview-2026-10-13.md`）；全量测试 561 通过（Phase 0 556 + 本阶段 5 条 E2E）。
- 范围约束（始终有效）：不接入 document_images、不运行 Docling、不改图片授权、不实现 PDF/Word 上传、不动旧版 entries/import-job.service、迁移仅 `microera_wiki_test`、不 commit/push。

---

## 1. 真实文档任务入队来源（已核查）

KB 文档任务的真实入队点集中在 `backend/services/parse-api.service.ts`，均经 `parseJobService.enqueue({ document_id, kb_id, payload:{action} })`，入队后**写入 `documents.current_parse_job_id`**（见 D1）：

| 入口 | 动作 | payload.action |
| --- | --- | --- |
| `parseApiService.upload` | 新建 source+document+revision(rev1)，入队 | `parse` |
| `parseApiService.importUrl` | 抓 URL 文本，新建 document，入队 | `parse` |
| `parseApiService.parse` | 对已有文档入队 | `parse` |
| `parseApiService.reparse` | 强制重解析 | `reparse`（`force:true`） |

> `server/routes/pipeline.ts` 的 `importJobService.createJob` 属旧版 **entries** 路径，不在 KB 队列范围，Phase 1 不动它。

## 2. 纯文本 Markdown/TXT 处理链路（已实现）

Phase 1 只走纯文本快路径：文档 `content` 已是 markdown，处理器**不再**调用 Docling CLI / elementService / ingestService，而是直接在事务外做「抽取 → 分块 → 嵌入」，仅把最终结果交给原子提交事务（见 `backend/services/parse-processor.service.ts`）：

1. `findDocumentById(job.document_id)`（KB/文档软删则 undefined → 抛 `DOCUMENT_GONE`，永久失败不重试）
2. `markdown = doc.content`（纯文本已是 markdown）
3. `extractElements(markdown)`（纯函数，事务外）
4. `chunkService.chunk(markdown, ...)`（纯函数，事务外）
5. `ollamaEmbedder.embedBatch(...)`（慢、可部分失败，事务外；失败 chunk 跳过向量）
6. `parseCommitRepository.commitParsedDocument(...)`（D2 原子提交）
7. `parseJobService.complete(job.id, owner)`（guardedUpdate → succeeded）

> HTML / 二进制（PDF/DOCX/…）走 Docling CLI，属后续阶段/图片业务，本轮不实现。

## 3. D1 — `documents.current_parse_job_id`（当前任务归属约束，Schema 变更）

- 迁移 `0021_add_document_current_parse_job.sql`：`ALTER TABLE "documents" ADD COLUMN "current_parse_job_id" text;`（可空）。
- 语义：记录「最新一次入队的解析任务 id」。入队点（upload/importUrl/parse/reparse）在 enqueue 后调 `knowledgeRepository.setCurrentParseJob(documentId, jobId)`。
- 提交事务内对 `documents` 行 `FOR UPDATE` 后校验：`current_parse_job_id IS NULL OR = 本 job.id`；指向别的 job → 抛 `SUPERSEDED`，整体回滚。**旧解析任务晚提交被 fence 掉，绝不覆盖新结果**（消除无条件 last-writer-wins）。
- 旧文档（列为 NULL）不设归属约束，允许提交（兼容既有数据/待迁移前 pending 任务）。

## 4. D2 — 单事务「fence 门 + 下游写」原子提交

`backend/repositories/parse-commit.repository.ts` 的 `commitParsedDocument(...)` 在**一个 `db.transaction`** 内顺序执行，任何 fence 失败抛 `ParseCommitError` 并整体回滚：

1. `SELECT ... FROM parse_jobs WHERE id=$jobId FOR UPDATE` → `cancelled`→`CANCELLED`；非 running/owner/version→`LEASE_LOST`。
2. `SELECT ... FROM documents WHERE id=$docId FOR UPDATE` → 软删/换 KB→`DOCUMENT_GONE`；`current_parse_job_id` 指向别的 job→`SUPERSEDED`。
3. `SELECT ... FROM knowledge_bases WHERE id=$kbId AND deleted_at IS NULL FOR UPDATE` → 空→`DOCUMENT_GONE`。
4. 幂等 delete+insert 替换 `document_elements`。
5. 幂等 delete+insert 替换 `knowledge_chunks`。
6. 文档行锁内计算 `revisionNo = max(revision_no)+1`（配合 `document_revisions (document_id, revision_no)` 唯一索引防重）。
7. 插入 revision + 更新 `documents.content/parse_status='completed'/current_parse_job_id=NULL` + delete+insert 替换 `knowledge_vectors`。

> 实现要点：所有下游写**内联在 `tx` 上**（不调用 `saveElements`/`saveChunks`/`publishDocument`——前者是 `NodePgDatabase` 类型、后者自开事务，嵌套会出错）。嵌入仍在事务外，向量作为参数传入。

## 5. D3 — 解析/分块/嵌入在事务外，仅写库在事务内

处理器 `createPureTextProcessor()` 只做纯计算（抽取/分块/嵌入），慢且可能部分失败的嵌入绝不放进 DB 事务；唯一落库点是 `commitParsedDocument`。嵌入部分失败沿用既有语义：成功多少写多少向量，文本/chunk/revision 照常发布。

## 6. D4 — 错误分类（取消 / 租约失效 / 永久失败）

`ParseCommitError` code ∈ `LEASE_LOST | CANCELLED | SUPERSEDED | DOCUMENT_GONE`。`ParseWorker.runJob` 的 catch 分支：

| code | 处理 |
| --- | --- |
| `LEASE_LOST` / `CANCELLED` | 静默返回（任务已回收/已取消，不写、不 fail、不 complete） |
| `SUPERSEDED` / `DOCUMENT_GONE` | `parseJobService.failPermanently(...)`：`guardedUpdate`→`status='failed'`+`error_code`+`finishedAt`+清租约，**不重试、不死信** |
| 其他异常 | 沿用 `fail(..., 'PARSE_WORKER_ERROR')`（可重试/死信） |

处理器成功返回后 `runJob` 仍调 `complete`（guardedUpdate→succeeded）。

## 7. 重复解析 / 取消 / 父 KB 软删 / 租约过期

| 场景 | 最终处理 |
| --- | --- |
| 重复解析 | ① `claim` CAS 保证同一 pending 仅一个 Worker 认领；② 下游 delete+insert 幂等；③ **旧任务晚提交被 `SUPERSEDED` fence 掉**（`current_parse_job_id` 已指向更新任务）。 |
| 取消 | 提交事务 fence `parse_jobs` 行：`cancelled`→抛 `CANCELLED`→静默返回，无下游写入。 |
| 父 KB 软删 | 处理器前置 `findDocumentById`（KB 感知）返回 undefined→`DOCUMENT_GONE`；提交事务内再校验 KB 行，双层防写。 |
| 租约过期 | `reclaimExpired` 回收→pending + `lease_version+1`；旧 Worker 在途提交被 fence（`LEASE_LOST`），新 Worker 全量重跑幂等覆盖。 |

## 8. 端到端验收（`microera_wiki_test`，已通过）

`tests/parity/parse-phase1-e2e.test.ts`（5 条，隔离库 + `assertTestDatabase` + `applyMigrations` 自动应用 0021 + 唯一种子 + 定向清理；`vi.spyOn(ollamaEmbedder,'embedBatch')` 返回确定性 1024 维向量，不依赖 Ollama）：

1. 成功链路：pending→succeeded，document `completed`、内容正确、`revision_no>=2`、chunks 非空、vectors 数 = chunk 数、`lexicalSearch` 命中该 document_id（检索闭环）。
2. 过期 Worker 无法写（`LEASE_LOST`）：document 仍 pending、无新增 chunk/vector/revision。
3. 取消不写（`CANCELLED`）：无下游写入、job 仍 cancelled。
4. 父 KB 软删不写（`DOCUMENT_GONE`）：job `failed`（error_code='DOCUMENT_GONE'），无下游写入。
5. 旧解析不覆盖新解析（`SUPERSEDED`）：jobA 被 fence 为 failed、无写入；jobB 成功后 document `completed` 且 chunks/vectors 齐备。

## 9. 剩余风险 / 边界（既有，未扩大）

- `complete` 与提交事务非同一事务：下游写已提交、`complete` 因租约微秒级回收失败时，job 回 pending、新 Worker 幂等重跑，最多多一条 revision（内容正确），不产生错误 `completed` 或部分发布。
- `replayDeadletter` 重建新 job id 的极边缘：重建 job 与 `current_parse_job_id` 可能不匹配而判 `SUPERSEDED`，记录为已知限制。
- 取消当前任务后 `current_parse_job_id` 仍指向已取消 job，后续 parse/reparse 会覆盖它；无覆盖则文档保持 pending，可接受。

> 以上为**开发侧验证**，不代表 Codex 独立复审通过（Codex 无额度）。
