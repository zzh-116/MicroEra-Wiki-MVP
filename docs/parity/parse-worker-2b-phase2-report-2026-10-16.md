# MiqroEra Wiki 2b — Phase 2 (TB-2) Docling Worker 真实 PDF/DOCX 解析 + 检索索引 完成报告

- 日期：2026-10-16
- 范围：TB-2 —— 复用 TB-1 受控源文件存储，Worker 从 DB 信任的 `sources.uri` 解析真实 PDF/DOCX（Docling 2.111.0 / Python 3.12.9）并落入既有 chunk/严格嵌入/fence 提交链路，形成 BGE-M3 检索索引
- 状态：代码与测试已完成；未 commit、未 push；迁移无新增；全部测试仅作用于隔离库 `microera_wiki_test` + 临时 DATA_DIR

---

## 1. 实际修改文件

### 新增

| 文件 | 作用 |
| --- | --- |
| `tests/parity/parse-phase2-docling-e2e.test.ts` | TB-2 隔离库 E2E（12 用例）：真实 PDF/DOCX happy path（真 Docling + 真 bge-m3）、MD/TXT 快路径、纯文本回归、7 类异常路径。环境门控 + 故障注入仅用于确定性故障用例 |
| `tests/fixtures/real-pdf.pdf` | 真实 PDF fixture（含唯一关键词 `zephyrquasar`，Docling 可解析） |
| `tests/fixtures/real-docx.docx` | 真实 DOCX fixture（同上） |

### 修改

| 文件 | 变更 |
| --- | --- |
| `backend/services/parse-processor.service.ts` | 扩展为源文件解析路由器：新增 6 个非敏感错误码（`SOURCE_FILE_MISSING` / `SOURCE_FILE_TOO_LARGE` / `SOURCE_HASH_MISMATCH` / `SOURCE_FORMAT_UNRECOGNIZED` / `DOCLING_DEPENDENCY_MISSING` / `DOCLING_PARSE_FAILED`）；`readSourceMarkdown`（解析 `sources.uri` → 存在性/大小/SHA-256 校验 → MD/TXT 直读、PDF/DOCX 走 Docling）；`translateDoclingError`（`ParserError` → 非敏感 `ParseProcessorError`）；`createDoclingProcessor` / `createParseProcessor`（生产路由器，路由只看 DB 信任的 source 记录，忽略客户端 payload） |
| `server/worker.ts` | Worker 默认处理器由 `createPureTextProcessor` 切换为 `createParseProcessor`（含路由）；更新文件头注释 |

**未修改**：`backend/parser/docling.ts`、`backend/parser/models.ts`（`parseFile`/`ParserError` 复用既有实现）、`parse-commit.repository.ts`、`parse-worker.service.ts`、所有 REST/CLI/MCP 路由与契约、Schema。

---

## 2. 迁移情况

- **无新增迁移、无 Schema 变更**：TB-2 完全复用 Phase 1 的 `0021_add_document_current_parse_job.sql`（`documents.current_parse_job_id`）与既有 `parse_jobs` / `knowledge_vectors` / `knowledge_chunks` / `document_revisions` 表结构。
- **应用范围**：测试仅由套件 `applyMigrations`（advisory lock 串行）应用到 `microera_wiki_test`；源文件写入临时 `DATA_DIR`（`fs.mkdtempSync`），不触碰开发 `DATA_DIR`。
- **开发库 / NUC / 腾讯云**：均未迁移、未触碰。

---

## 3. 测试结果（真实，非 mock）

### 3.1 全量回归
- `npx vitest run` → **57 文件 / 599 用例，全部通过，0 失败、0 跳过**。

### 3.2 typecheck
- `npx tsc --noEmit`（前端）→ 干净（exit 0）。
- `npx tsc --noEmit -p tsconfig.backend.json`（后端）→ 干净（exit 0）。

### 3.3 TB-2 套件（`parse-phase2-docling-e2e.test.ts`，12/12 全绿）

**真实端到端（真 Docling 2.111.0 + 真 BGE-M3 1024 维，无 mock）** —— 两条 happy path 均实际执行（非 skip）：

1. **真实 PDF**：`uploadFile(real-pdf.pdf)` → `createParseProcessor()` 解析 `sources.uri` → SHA-256 校验 → Docling 解析 → job `succeeded`、`documents.parse_status='completed'` → `chunks>0` → `knowledge_vectors` 行数 = chunk 数、`vector_dims=1024` → `content` 含 `zephyrquasar` → `vectorSearch` 与 `hybridSearch` 均命中该 `document_id`。
2. **真实 DOCX**：同上全链路（`real-docx.docx`）。

**MD/TXT 快路径（不启动 Docling，嵌入用确定性 1024 维 spy，无 Ollama 依赖）**：
3. `notes.md` 存储源文件直读 → succeeded/completed、chunks>0。
4. `notes.txt` 存储源文件直读 → succeeded/completed、chunks>0。
5. **纯文本快路径回归**：`upload(content=markdown)` 无 source 文件 → `createPureTextProcessor()` 读 `doc.content` → succeeded/completed、chunks>0（Phase 1 路径无回归）。

**异常 / fence 路径**：
6. **file-missing**：删除源文件 → `SOURCE_FILE_MISSING`，job `pending`（可重试）、文档仍 `pending`、0 chunk/0 vector/仅 rev1。
7. **hash-mismatch**：篡改源文件字节 → `SOURCE_HASH_MISMATCH`，同上级无任何下游写入。
8. **Docling-failure**：注入 `ParserError('boom','PARSE_FAILED')` → `DOCLING_PARSE_FAILED`，job `pending`（可重试）、无下游写入。
9. **cancel**：`parseJobService.cancel` 后 `runJob` → `CANCELLED` no-op，job `cancelled`、无下游写入。
10. **lost-lease**：过期租约 + `reclaimExpired`（version+1）后用旧 snapshot `runJob` → `LEASE_LOST` no-op，job 回 `pending`、无下游写入。
11. **old-task-overwrite**：`reparse` 产生 jobB 后用 jobA snapshot `runJob` → `SUPERSEDED`（jobA `failed`、无写入）；再 claim jobB `runJob` → succeeded、内容正确。
12. **parent-KB-soft-delete**：`deleteKb` 后 `runJob` → `DOCUMENT_GONE` 永久失败，无下游写入。

---

## 4. 与边界 / 10 项范围的一致性

| # | 范围项 | 落地情况 |
| --- | --- | --- |
| 1 | 复用 TB-1 源文件存储 + multipart，不重建上传系统 | ✅ 复用 `parseApiService.uploadFile` / `resolveSourceFilePath`，未改上传 |
| 2 | Worker 从 DB 信任 `sources.uri` 经 `resolveSourceFilePath` 解析，校验存在/大小/SHA-256 | ✅ `readSourceMarkdown` 完整校验链 |
| 3 | 不信任客户端 `source_file` / 绝对路径；payload 仅路由提示 | ✅ 路由只看 `doc.source_id → sources.uri`，payload 完全不参与 |
| 4 | 扩展 Docling Processor（Python 3.12.9 / Docling 2.111.0，PDF/DOCX） | ✅ `createDoclingProcessor`；真实 CLI 已跑通 |
| 5 | Markdown/TXT 纯文本快路径不变 | ✅ `md`/`txt` 直读；纯文本 `doc.content` 路径不变 |
| 6 | 结果进既有 chunk/严格嵌入/`commitParsedDocument`，不新建写逻辑 | ✅ `publishMarkdown` 复用 `extractElements`→`chunkService.chunk`→`embedStrictly`→`parseCommitRepository.commitParsedDocument` |
| 7 | 最终写落在 fence 事务（jobId/lease_owner/lease_version/current_parse_job_id/document+parent-KB） | ✅ 复用 Phase 1 单事务 `commitParsedDocument`，无改动 |
| 8 | Docling 失败/缺文件/hash 不匹配/依赖缺失 → 非敏感错误码，进既有 retry/deadletter | ✅ 6 个新错误码 → `ParseProcessorError` → worker 既有 `fail` 路径 |
| 9 | cancel/租约过期/被新 parse 取代/KB 软删 → 旧 Worker 不得提交 | ✅ 由既有 `ParseCommitError` 分类（CANCELLED/LEASE_LOST 静默，SUPERSEDED/DOCUMENT_GONE 永久失败），用例 9–12 验证 |
| 10 | `savedImages` 可作解析结果保留，但本轮不 `registerFromParse`、不改 `document_images` | ✅ `readSourceMarkdown` 明确不注册图片；未 import 任何图片注册逻辑 |

**严格边界核验**：无新 Schema、无破坏 REST/CLI/MCP 契约、未改动 entries / `import-job.service`、未做 dev/NUC/腾讯云迁移、未做图片授权注册、未 commit/push。

---

## 5. 已知残余（TB-2 边界内，不属本轮缺陷）

1. **全量套件存在一处**先验的**并行隔离竞态（非本轮引入）**：`parse-job-db.test.ts` 的 `beforeAll` 对共享 `microera_wiki_test` 的 `parse_jobs`/`parse_deadletters` 做 `TRUNCATE`，且其 `lease('worker-a', 5)` 依赖「全局最旧 5 条 pending 恰好包含自己刚 enqueue 的 job」。在 `parse_jobs` 被 6 个 parity 文件并行写入/TRUNCATE 时，该假设偶发失效（曾观察到一次 `mine undefined` 失败；单文件运行 3/3 通过；本次全量 599/599 通过）。TB-2 未触碰 `lease`/`listPending`/TRUNCATE 路径，故该竞态与本次改动无关，但新增的 docling E2E 文件增加了 `parse_jobs` 并行流量，使其触发概率略有上升。建议作为独立测试基础设施项（串行化 DB 依赖的 parity 套件，或改用 `fileParallelism:false` / advisory-lock 串行）另行处理，本轮未自行扩范围。
2. **Docling `savedImages` 未入库**：按范围第 10 条，本轮解析结果仅保留 markdown，图片注册留待 P1-B / 后续阶段。
3. **生产迁移**：无（无新增迁移）。

---

## 6. 是否可进入 TB-3

**可以。** TB-2 交付物完整：真实 PDF/DOCX 解析 + BGE-M3 检索索引闭环已用真 Docling + 真向量验证；异常与 fence 路径全覆盖；全量 599/599 + 双 typecheck 通过；无 Schema/契约变更。TB-3 可在此基础上接图片副作用（`document_images` 注册）或其余独立阶段，不依赖 TB-2 之外的未决项。
