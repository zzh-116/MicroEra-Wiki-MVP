# MiqroEra Wiki 2b — Parse Job Worker 设计与依赖核查

- 日期：2026-10-13
- 范围：2b Parse Job Worker（`parse_jobs` 消费端）的设计与依赖核查，**仅设计文档，不改代码**
- 前置：P1-B 图片可信归属（`document_images`）已实现；`parse_jobs` 持久化队列已实现但**无 Worker 消费**
- 约束：本轮不修改业务代码、不执行数据库迁移、不 commit、不 push；不输出 JWT/密码/敏感正文

---

## 0. 结论摘要

- `parse_jobs` 队列原语（enqueue/lease/heartbeat/checkpoint/complete/fail/retry/cancel/deadletter/replay）已完整，但**没有任何生产代码调用 `lease()`** —— 队列只有生产者、没有消费者。
- `Docling` 解析器与 KB 文档写入链（elements → chunks → embed → `publishDocument` 原子提交）均已就绪，`registerFromParse` 也已就绪但未接线。
- 关键缺口：① 无 Worker；② 无租约过期回收（崩溃的 Worker 让 job 永远停在 `running`）；③ 写入路径存在 TOCTOU（`update()` 只按 `id` 更新，未按 owner/版本守卫）；④ KB 域缺少二进制源字节持久化。
- 本设计引入 **fencing token（`lease_version`）** 关闭 TOCTOU、**单事务一致性提交** 避免新旧图片归属互删、**受控源文件保存** 禁止任意 `file_path`，并明确**旧 `entries` 域与新 `documents` 域不合并**。

---

## 1. 源码核查结果（实际实现）

### 1.1 `parse_jobs` 队列原语

文件：`backend/services/parse-job.service.ts`、`backend/repositories/parse-job.repository.ts`、表 `parse_jobs`（`backend/db/schema.ts`）。

| 原语 | 实现 | 关键语义 / 缺陷 |
| --- | --- | --- |
| `enqueue` | `createJob`，`id=parse_<uuid>`，`max_attempts` 默认 3，`type` 默认 `parse` | 每次调用新建行（非幂等） |
| `lease(owner, limit=5, leaseSec=60)` | `listPending`（仅 `status='pending'`）→ 逐个 `claim` | `claim` 是 CAS：`UPDATE … WHERE status='pending'` 置 running+owner+lease_expires_at+started_at；并发安全 |
| `heartbeat` | 校验 `running && lease_owner===owner` → 续期 | owner 不匹配抛 `conflict` |
| `checkpoint` | 校验 running+owner → 写 `checkpoint` jsonb | 续跑点已备 |
| `complete` | 校验 running+owner → succeeded/100/done/finished_at | |
| `fail` | owner 校验 → `attempt+1`；`attempt>=max` → deadletter+failed+releaseLease；否则 → pending+releaseLease | 重试/死信已实现 |
| `retry` | 仅 failed → pending，清 error/stage/progress | **不重置 `attempt`** |
| `cancel` | 仅 pending/running → cancelled+finished_at；running 时 releaseLease | `jobService.cancel` **不释放租约** |
| `replayDeadletter` | 重置/重建原 job 为 pending，`markReplayed` | 不丢任务 |

**核查缺陷清单（设计必须覆盖）：**
- D1 无 Worker 消费。
- D2 无租约回收器：崩溃 Worker 遗留的 `running` job 永不回收（`listPending` 只看 `pending`）。
- D3 `parseJobService.retry` 不重置 `attempt`（与 `jobService.retry` 不一致）→ 死信任务 retry 后下次 fail 立即再死信。
- D4 `jobService.cancel` 不释放租约（与 `parseJobService.cancel` 不一致）。
- D5 **TOCTOU**：服务层的 owner/status 校验是「先 `findById` 再 `update`」，而 `repository.update()` 只按 `id` 无条件更新。旧 Worker 在租约失效后仍可覆盖写入。
- D6 `JobStatusView` 不暴露 `checkpoint`/`lease_expires_at`（续跑需直接读 repository）。

### 1.2 Docling 解析器

`backend/parser/docling.ts`：`parseFile/parseString/parseBuffer` → `ParseResult{ markdown, sourceFormat, checksum, metadata, savedImages, properties, warnings, timing }`。`extractAndSaveImages` 将 base64 图片存为 **UUID 文件名**（`wx` 防覆盖）并改写为 `/api/images/<uuid>`。文本格式走快路径，HTML 与二进制走 Docling CLI（首次需下载 HF 模型 ~2GB）。

### 1.3 KB 文档写入链（P2-05）

`backend/services/ingest.service.ts`：

```
findDocumentById (KB 感知：KB/文档软删则 undefined)
 → elementService.extractAndSave   (document_elements, delete+insert 幂等)
 → chunkService.chunk + saveChunks (knowledge_chunks, delete+insert 幂等)
 → ollamaEmbedder.embedBatch       (bge-m3, 1024 维)
 → publishDocument (单事务: append revision + update content/parse_status='completed' + replace knowledge_vectors)
```

要点：`ingest` **只消费已解析的 `documents.content`**，不跑 Docling，也不登记图片。

### 1.4 图片归属（P1-B）

`documentImageService.registerFromParse` → `registerImages`（`onConflictDoNothing` 幂等）；`rollbackDocumentImages` 失败清理；`orphanScan` 只读孤儿扫描。**三者均未被生产调用。**

### 1.5 两套数据模型（必须隔离）

| | 旧域（legacy） | 新域（KB） |
| --- | --- | --- |
| 主表 | `entries` | `documents` |
| 分块 | `document_chunks` | `knowledge_chunks` |
| 向量 | `vectors` | `knowledge_vectors` |
| 来源 | — | `sources` |
| 版本 | — | `document_revisions` |
| 布局/图片 | — | `document_elements` / `document_images` |
| 服务 | `import.service` + `import-job.service`（内存 Map） | `parse-api.service` + `parse-job.service`（持久化） + `ingest.service` |
| 入口 | `/api/pipeline/import`、`/pipeline/import/string` | `/api/v2/ops/doc/*` |

`documents.entry_id` 是兼容适配器（旧 entry → 新 doc 的可选外键），**不是**把两套模型合并。Worker 只在新域内运行，绝不写 `entries` 一族。

---

## 2. 完整执行链路设计

```
上传 → 入队 → Worker lease → Docling 解析 → 文档持久化(一致提交) → 图片归属登记 → Chunk/向量索引 → 任务完成
```

新增编排模块（设计态，未创建）：`backend/services/parse-worker.service.ts`。

```
runJob(job, owner, version):
  1. 前置守卫：findDocumentById(job.document_id) 为空（KB 或文档已软删）
       → failGuarded(owner, version, 'KB_DELETED'|'DOC_DELETED')，不重试
  2. updateDocument(docId, { parseStatus:'processing' })
  3. 解析分支：
     a) 文本/URL：documents.content 已就绪 → parser.parseString(content)
     b) 二进制/HTML：读受控源文件 → parser.parseFile(sourcePath)   // 见 §4
     → ParseResult.markdown + savedImages
  4. 一致性提交（§3）：elements + chunks + embed + publish + 图片归属替换，单事务
  5. completeGuarded(jobId, owner, version)
失败路径：
  throw → rollbackDocumentImages(docId) → updateDocument(parseStatus:'failed')
  → failGuarded(jobId, owner, version, error, errorCode)
```

**心跳**：解析期间独立 `setInterval` 调 `heartbeatGuarded` 续期；进入持久化前做一次「仍持有 fencing token」校验。

---

## 3. Fencing Token 与一致性提交（本设计的核心增强）

### 3.1 Fencing token（关闭 D5 TOCTOU）

在 `parse_jobs` 增加 `lease_version int NOT NULL DEFAULT 0`（fencing token）：

- `claim` 成功时 `lease_version = lease_version + 1` 并返回给 Worker。
- 新增 `reclaimExpired(now)`：把 `running 且 lease_expires_at < now` 的 job 转回 `pending`，同时 `lease_version = lease_version + 1`（作废旧 Worker 持有的 token）。
- 所有 worker 写入（`heartbeat`/`checkpoint`/`complete`/`fail`）改为 **受守卫更新**：
  `UPDATE … WHERE id = ? AND lease_owner = ? AND lease_version = ?`。
- 旧 Worker 在租约被回收后，其 `lease_version` 已失效 → 写入影响 0 行 → 服务层判定失去所有权并中止，**不再覆盖**。

> 这是对现状（`repository.update()` 只按 `id`）的必要修复。属 Schema 变更，见 §7。

### 3.2 一致性提交：解析结果 + Chunk + 向量 + document_images

目标：内容、分块、向量、图片归属作为一个逻辑单元提交，且**新旧图片归属不互相误删**。

提交顺序（单事务 `db.transaction`）：
1. `saveElements(documentId, newElements)` —— delete+insert 幂等；
2. `saveChunks(documentId, newChunks)` —— delete+insert 幂等；
3. `publishDocument(...)` —— append revision + 更新 content/parse_status + 替换 knowledge_vectors（已有原子实现）；
4. **图片归属替换**（在事务内，与 3 同事务）：
   - `DELETE FROM document_images WHERE document_id = ? AND image_name NOT IN (newImageNames)`;
   - `INSERT … (document_id, image_name) VALUES … ON CONFLICT DO NOTHING`（新名）。

关键保证：
- **文件层**：每次解析生成**全新 UUID 文件名**（`wx` 防覆盖），永远不覆盖旧文件 → 新旧图片在磁盘上天然不互删。
- **归属层**：替换只作用于「当前 document_id + 旧名集合」，不触碰其它文档对同一图片的归属（UUID 也几乎不可能共享）。
- **失败回滚**：事务内任何一步失败整体回滚（DB 层一致）；磁盘上已写入的新 UUID 文件成为孤儿，交给 `orphanScan` 的**延迟 GC**（见 3.3）。
- **提交时机**：图片归属登记放在 `publishDocument` 之后、同事务内，保证「只有完整落库的内容才授予图片访问」。

### 3.3 延迟 GC（唯一允许删文件的点）

- `document_images` 替换后，旧文件不立即删除。
- GC（独立、低频）只删除「文件名**不在任何** `document_images` 行中」的文件，并施加宽限期（如 `created_at` 之前 N 天）。
- 这样即使重解析中途崩溃、或两个文档恰好引用同名，也绝不会误删仍在归属表中的文件。

---

## 4. 二进制上传的受控源文件保存（禁止任意 file_path）

- **禁止**客户端通过 `file_path` 指定任意服务器绝对/相对路径。`doc.upload` 现有 `file_path` 入参必须改造。
- 二进制路径采用 **multipart 上传**（复用 `/api/pipeline` 的 multer 模式）：
  1. 服务端将上传字节写入 `DATA_DIR/sources/<random_uuid>`（`wx` 防覆盖，服务端生成名字）；
  2. 记录 `documents.source_path = <服务端生成的相对路径>`（或 `sources.uri`），**永不采纳客户端路径**；
  3. 权限：路径型导入仅限 `admin`（与 `/api/pipeline` 的 filePath admin-only 规则一致）。
- 若保留「服务端工具传路径」的能力，则必须：仅接受 **basename**，拒绝 `..`、盘符、绝对路径，`path.resolve` 后校验其仍在 `DATA_DIR/sources` 白名单目录内。
- 源文件生命周期：解析完成后可保留（供 reparse 溯源）或按策略回收；回收前需保证该文档无 pending/running 的 reparse 任务。

---

## 5. 可靠性语义

| 场景 | 处理 |
| --- | --- |
| 重复消费 | ① `claim` CAS 保证同一 pending 只会被一个 Worker 认领；② 持久化幂等（saveElements/saveChunks delete+insert、publish 原子、图片 ON CONFLICT）。残余非幂等点＝revision append（崩溃后最多多一条 revision，内容正确，可接受） |
| Worker 崩溃 | `reclaimExpired` 回收过期 job 并递增 `lease_version`（作废旧 Worker） |
| 租约过期 | 心跳续期失败即视为失权；所有写入走 `lease_version` 守卫，失权后写入 0 行 → 中止 |
| 部分写入 | 顺序「先可覆盖、后原子提交」：elements/chunks 幂等可覆盖 → publish 原子 → 图片同事务；崩溃残留由重试覆盖，图片文件由延迟 GC 兜底 |
| 任务取消 | 协作式：每阶段前重读 job 状态，`cancelled` 即停；Docling CLI 可持有 child 句柄并 kill；取消时 releaseLease + 清理部分产物 |
| 父 KB 软删 | `findDocumentById` 返回 undefined → 前置守卫判定永久失败（不重试）；`ingest`/`publish` 全部 KB 感知，不会给已删 KB 写 chunk/vector/image |

---

## 6. F2 内存 Map 与持久化队列不一致 — 兼容方案

现状三套：`import-job.service`（内存 Map，旧域 entries）、`src/services/uploadManager.ts`（前端内存 Map）、`parse-job.service`（持久化，新域 documents，无 Worker）。

**方案：共存 + 桥接，不合并。**
- 以 `parse_jobs` 为**新域唯一事实来源**；2b Worker 只消费它、只写 `documents` 一族，**绝不触碰 `entries`**。
- 旧 `import-job.service` 维持现状并标记 legacy，本轮不并入、不迁移；前端 binary 上传继续指向旧 `/pipeline`，KB 域上传走 `doc.upload`。
- 中期（Phase 5）再决策：把 `/pipeline/import` 迁到 `parse_jobs`（需 entries↔documents 桥）或显式废弃。
- 硬约束：Worker 以 `payload.action` / `document_id` 判别只处理新域任务；两域表与索引互不引用。

---

## 7. 需新增的 Schema / API / 部署配置

### Schema（新迁移，本轮不执行）
- **0020 — fencing token**：`parse_jobs` 增加 `lease_version int NOT NULL DEFAULT 0`（+ 索引按需）。
- **0021 — 源文件持久化**：`documents` 增加 `source_path text`（指向 `DATA_DIR/sources/<uuid>`），或复用 `sources.uri/metadata`（需确认选型）。
- 可选：`parse_jobs.reclaim_count` / `attempted_at`（观测，非必要）。

### API 契约
- `doc.upload`：二进制 multipart 上传 + 服务端受控落盘；移除/约束 `file_path` 任意路径；权限 admin-only。
- `job.*`：可选暴露 `checkpoint/stage` 更细进度。
- `doc.wait` 已够用。

### 部署配置
- Worker 运行形态：**独立进程**（推荐，`cli` 新增 `microera worker` 或独立入口，systemd/PM2 守护）vs 进程内循环（`WORKER_ENABLED` 开关）。独立进程可水平扩展、不受 HTTP 重启影响。
- 运行依赖：Postgres、Docling CLI + Python + HF 模型缓存（二进制）、Ollama + bge-m3（embedding）。
- 多实例：靠 `claim` CAS + fencing token，无需额外锁；各实例须共享 `DATA_DIR`（图片/源文件）。
- 配置项（env）：并发数 N、租约 T、心跳间隔、GC 宽限期、`WORKER_ENABLED`。

---

## 8. 分阶段实施（每阶段：修改文件 / 测试 / 回滚）

### Phase 0 — 租约回收 + fencing + 骨架
- 修改：`parse-job.repository.ts`（`reclaimExpired`、claim 返回 version、guarded update）、`parse-job.service.ts`（retry 重置 attempt、暴露 reclaim）、`job.service.ts`（cancel releaseLease）、`schema.ts`（lease_version）、迁移 0020。
- 测试：崩溃恢复（杀 Worker → 过期 job 被回收且旧 Worker 写入 0 行）、retry/cancel 语义、fencing 单测。
- 回滚：`git revert` 本阶段文件 + `ALTER TABLE parse_jobs DROP COLUMN lease_version`。

### Phase 1 — Worker + ingest（文本/URL）
- 修改：新增 `parse-worker.service.ts`（loop + runJob 文本分支）、`ingest.service.ts`（接受已解析 markdown 覆盖）、`parse-api.service.ts`（文本不变）。
- 测试：`doc.upload`(text) → 自动 ingest → `parse_status=completed`，chunks/vectors/elements/images 齐全；真实 HTTP 上传→轮询→完成。
- 回滚：`git revert`；无 Schema 变更。

### Phase 2 — Worker + Docling（二进制/HTML）+ 受控源文件
- 修改：`parse-api.service.ts`（multipart + 受控落盘）、`server/routes/knowledge-v2.ts`（upload 路由）、`schema.ts`（source_path）、迁移 0021。
- 测试：PDF/DOCX → Docling → data-URI 图片抽出并登记 → chunks/vectors；`file_path` 任意路径被拒。
- 回滚：`git revert` + `ALTER TABLE documents DROP COLUMN source_path` + 清理 `DATA_DIR/sources` 新文件。

### Phase 3 — 可靠性加固
- 修改：心跳续期、协作式取消（Docling child kill）、reparse 图片替换 + 延迟 GC、KB 软删永久失败、deadletter/replay 端到端。
- 测试：崩溃/过期/取消/重复/部分写入全套；reparse 后旧图片不再可访问、无残留归属行。
- 回滚：`git revert`。

### Phase 4 — 部署与可观测
- 修改：独立 Worker 进程入口、env 配置、日志/job 进度可见、部署 runbook。
- 测试：双 Worker 并行不双写；灰度上线历史图片兼容性说明。
- 回滚：停 Worker 进程、`git revert` 入口。

### Phase 5 — F2 收敛（可选，单独决策）
- 修改：legacy `/pipeline/import` 迁移或废弃（需 entries↔documents 桥）。
- 测试：单一 job 事实来源。
- 回滚：按届时方案。

---

## 9. 测试数据库隔离与验收标准

复用既有隔离范式（`tests/helpers/assert-test-db.ts` + `apply-migrations.ts` advisory lock + 临时 `DATA_DIR`）：

- 所有 DB 套件运行在 `microera_wiki_test`，`beforeAll` 校验 `SELECT current_database()`；迁移经 `pg_advisory_lock` 串行应用；种子用唯一后缀（不 TRUNCATE）；`afterAll` 级联清理种子 KB。
- Worker 测试用临时 `DATA_DIR`，避免污染真实图片/源文件目录。

**验收标准（必须逐条通过）：**
1. 任务崩溃恢复：Worker 处理中被 kill → 租约过期后 job 被 `reclaimExpired` 回收并重跑，旧 Worker 续写被 fencing 拒绝。
2. 重复消费：同一 job 不会被两个 Worker 同时认领（`claim` CAS）；重跑幂等（chunks/vectors/归属行不重复，最多多一条 revision）。
3. 取消：pending/running 取消生效；取消后不再持久化部分结果；释放租约。
4. 父 KB 软删：KB 软删后 job 前置守卫判永久失败，不写 chunk/vector/image，不无限重试。
5. 图片归属一致性：reparse 后旧名从 `document_images` 移除、新名登记；旧文件不被误删（GC 仅删无主文件）；新/旧图片互不覆盖。
6. 全量回归：`npx vitest run` 全绿 + `tsc --noEmit` 与 `tsc -p tsconfig.backend.json` 干净。

---

## 10. 正式实施前需你批准的决策项

1. **Worker 运行形态**：独立进程 vs 进程内循环（推荐独立进程 + `WORKER_ENABLED` 门控）。
2. **fencing token 迁移 0020**：`parse_jobs.lease_version` 是否批准（核心安全修复，强烈建议）。
3. **二进制源字节持久化迁移 0021**：新增 `documents.source_path` 列 vs 复用 `sources.uri/metadata`。
4. **二进制 KB 上传入口**：`doc.upload` 采用 multipart；`file_path` 任意路径是否彻底移除（建议移除）。
5. **reparse 图片语义**：替换 + 延迟 GC（推荐）vs 幂等追加。
6. **§1 缺陷 D3/D4 小修**（retry 重置 attempt、cancel 释放租约）是否纳入。
7. **F2 取舍**：短期共存（推荐）vs 本轮统一（超出 2b 范围，建议 Phase 5）。
8. **并发/租约/GC 参数**：并发 N、租约 T、心跳间隔、GC 宽限期默认值。
9. **embedding 依赖**：早期是否允许 skipEmbedding（Ollama 未就绪时先 parse+chunk，后补向量）。
10. **Phase 1 最小范围**（见 §11）是否按此启动。

---

## 11. 第一阶段（最小可实施范围）

**目标**：让持久化队列「活起来」并具备安全回收能力，暂不引入 Docling 与二进制。

- **修改文件**：
  - `backend/db/schema.ts` + 迁移 `0020_add_parse_job_lease_version.sql`
  - `backend/repositories/parse-job.repository.ts`（`claim` 返回 version、`reclaimExpired`、guarded update）
  - `backend/services/parse-job.service.ts`（retry 重置 attempt；暴露 reclaim）
  - `backend/services/job.service.ts`（cancel 释放租约）
  - 新增 `backend/services/parse-worker.service.ts`（最小 loop：lease → 文本/URL 走 `ingestService.ingest` + `registerFromParse` → complete；失败 fail）
- **测试**：`tests/parity/parse-worker.test.ts` + `tests/parity/parse-worker-db.test.ts`（隔离库），覆盖 §9 验收项 1–4。
- **回滚**：`git revert` 上述文件 + `ALTER TABLE parse_jobs DROP COLUMN lease_version`。
- **不动**：`entries` 域、`import-job.service`、Docling 二进制、`doc.upload` multipart（留待 Phase 2）。

---

本轮仅保存设计文档。未修改业务代码、未执行数据库迁移、未 commit/push，未输出 JWT/密码/敏感正文。
