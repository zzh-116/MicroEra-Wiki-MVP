# MiqroEra Wiki 2b — TB-3 交付报告：解析异常处理、文件生命周期与失败恢复

- 日期：2026-10-19
- 范围：Tier B / TB-3 —— Docling 错误分类（永久 vs 可重试）、受控源文件延迟 GC、临时文件 GC、失败恢复与隔离测试
- 状态：**未 commit、未 push**；全部测试仅作用于 `microera_wiki_test`（`assertTestDatabase` 运行时保护保留）；未新增 Schema、未改公开 REST/CLI/MCP 契约、未改旧版 entries/import-job.service、未迁移 dev/NUC/腾讯云

---

## 0. 结论（是否具备本地交付验收条件）

**具备。** 本轮在「不新增 Schema、不改公开 API、不破坏 Phase 1 事务栅栏」的硬约束下完成了全部 10 项要求：全量 58 文件 / 613 用例全绿（0 失败、0 跳过），`npx tsc --noEmit` 与 `npx tsc --noEmit -p tsconfig.backend.json` 双双通过，GC dry-run 演示输出为不含敏感正文的元数据报告。无任何触发「停止并报告」的阻断项（无需 Schema 变更、无需改删除/恢复语义、GC 未误删有效源文件）。

---

## 1. 实际修改文件

### 新增
| 文件 | 职责 |
| --- | --- |
| `backend/storage/source-file-gc.ts` | 受控源文件延迟 GC：所有权/保留期限/活跃任务三重门 + dry-run 优先 + 非敏感报告 |
| `backend/storage/temp-file-gc.ts` | 临时文件 GC：清理 Docling 泄漏工作目录（`docling_*` 前缀），dry-run 优先 |
| `tests/parity/parse-phase3-tb3.test.ts` | TB-3 隔离测试（14 用例）：永久/可重试分类、取消、软删、保留期、GC 并发、重试、孤儿扫描、dry-run 安全、临时文件 GC |

### 修改
| 文件 | 变更 |
| --- | --- |
| `backend/services/parse-processor.service.ts` | `ParseProcessorErrorCode` 新增 `SOURCE_FILE_ENCRYPTED`/`SOURCE_FILE_CORRUPTED`/`DOCLING_TIMEOUT`/`DOCLING_EMPTY_OUTPUT`；`ParseProcessorError` 增加 `retryable` 字段（默认 true）；`translateDoclingError` 改为完整 switch 分类；所有永久故障抛点显式 `retryable=false` |
| `backend/services/parse-worker.service.ts` | `runJob` 增加分支：`ParseProcessorError && !retryable` → `failPermanently`（terminal，不重试/不死信） |
| `backend/parser/docling.ts` | 3 处临时目录 `./backend/data/tmp` → `config.dataDir/tmp`（使 temp GC 生效、尊重 DATA_DIR） |
| `tests/parity/parse-phase2-docling-e2e.test.ts` | 2 条故障用例（file-missing / hash-mismatch）由「可重试」改为「永久失败」，并新增死信缺失断言 |

### 未改动（按约束）
`parse-commit.repository.ts`（Phase 1 fenced commit）、`parse-job.repository.ts`、`parse-job.service.ts`、`parse-api.service.ts`、`knowledge.repository.ts`、`db/schema.ts`、任何迁移/路由/CLI/MCP、`document_images`（本阶段刻意**不接入**）、`entries/import-job.service`。

---

## 2. 错误码及状态矩阵

`ParseProcessorError` 现含 14 个错误码，各带 `retryable` 分类；Worker 据此分流。

| error_code | 触发来源 | retryable | 最终 job 状态 | 是否死信 |
| --- | --- | --- | --- | --- |
| `SOURCE_FILE_MISSING` | 文件缺失/空/无效存储路径 | **永久** | `failed`（terminal） | 否 |
| `SOURCE_FILE_TOO_LARGE` | 超过 50MB 上限 | **永久** | `failed` | 否 |
| `SOURCE_HASH_MISMATCH` | 磁盘字节 SHA-256 与 DB 摘要不符 | **永久** | `failed` | 否 |
| `SOURCE_FILE_ENCRYPTED`（新） | Docling `ENCRYPTED` | **永久** | `failed` | 否 |
| `SOURCE_FILE_CORRUPTED`（新） | Docling `CORRUPTED` | **永久** | `failed` | 否 |
| `SOURCE_FORMAT_UNRECOGNIZED` | 非法扩展名 | **永久** | `failed` | 否 |
| `DOCLING_EMPTY_OUTPUT`（新） | Docling 输出为空 | **永久** | `failed` | 否 |
| `DOCLING_TIMEOUT`（新） | Docling `TIMEOUT` | 可重试 | `pending`（attempt+1）→ 超限死信 | 是（超限后） |
| `DOCLING_DEPENDENCY_MISSING` | Docling `DEPENDENCY_MISSING` | 可重试 | `pending` → 超限死信 | 是（超限后） |
| `DOCLING_PARSE_FAILED` | Docling `PARSE_FAILED` / 未知异常 | 可重试 | `pending` → 超限死信 | 是（超限后） |
| `EMBEDDING_FAILED` / `EMBEDDING_*` | 严格嵌入失败 | 可重试 | `pending` → 超限死信 | 是（超限后） |
| `LEASE_LOST` / `CANCELLED` | 租约失效 / 取消 | n/a | **静默 no-op**（不改状态） | 否 |
| `SUPERSEDED` / `DOCUMENT_GONE` | 被新任务取代 / 文档或 KB 软删 | n/a | `failed`（terminal） | 否 |

设计原则：**永久失败 = 磁盘字节的固有属性**（缺失/损坏/加密/格式/空输出），重试无法改变结果，故终止且不死信；**可重试 = 环境/瞬态**（依赖不可用/超时/通用解析失败），沿用 `fail` → 超限死信。默认 `retryable=true`，未标注的抛点安全降级为「可重试」而非「误丢弃任务」。

---

## 3. GC dry-run 结果（本地演示）

演示脚本（临时、已删除）针对一次性 `DATA_DIR` + 只读测试库运行两个 GC 的 dry-run：

**Source-file GC dry-run**（孤儿源文件，retentionMs=0）：
```json
{ "dryRun": true, "scanned": 1, "eligible": 1, "removed": 0, "skipped": 0, "failures": 0,
  "candidates": [ { "storedName": "orphan-demo.txt", "uri": "sources/orphan-demo.txt",
      "size": 51, "mtimeMs": 0, "reason": "orphan",
      "activeSourceRef": false, "activeJobRef": false, "deadletterRef": false, "eligible": true } ] }
```

**Temp-file GC dry-run**（泄漏 Docling 目录，staleMs=0）：
```json
{ "dryRun": true, "scanned": 1, "eligible": 1, "removed": 0, "skipped": 0, "failures": 0,
  "candidates": [ { "name": "docling_1690000000000", "size": 20, "mtimeMs": 0, "eligible": true } ] }
```

要点：
- dry-run `removed=0`，孤儿文件与泄漏目录在 dry-run 后**仍存在**（`existsSync=true` 自证）；
- 报告仅含文件名/大小/mtime/原因等元数据，**不含文件正文**（演示写入的 `orphan demo body that must not appear…` 未出现在 JSON 中）；
- `tmp/other_*` 非 Docling 前缀条目**未被扫描**（scanned=1 而非 2），证明严格按已知前缀收敛。

---

## 4. 异常恢复 E2E 证据（`tests/parity/parse-phase3-tb3.test.ts`，14 用例）

| 场景 | 断言 |
| --- | --- |
| 加密文件（ENCRYPTED） | job `failed` + `SOURCE_FILE_ENCRYPTED`，无死信，文档仍 `pending` |
| 损坏文件（CORRUPTED） | job `failed` + `SOURCE_FILE_CORRUPTED`，无死信 |
| 空输出（EMPTY_OUTPUT） | job `failed` + `DOCLING_EMPTY_OUTPUT`，无死信 |
| 超时（TIMEOUT） | job `pending` + `DOCLING_TIMEOUT` + `attempt=1`，无死信（可重试） |
| 依赖缺失（DEPENDENCY_MISSING） | job `pending` + `DOCLING_DEPENDENCY_MISSING`，无死信 |
| 重试恢复（PARSE_FAILED → pending → 重试成功） | 首轮 `pending`+`DOCLING_PARSE_FAILED`；重试后 `succeeded` + 文档 `completed` |
| 取消（CANCELLED） | job `cancelled`，文档 `pending`，无写入 |
| 父 KB 软删（DOCUMENT_GONE） | job `failed` + `DOCUMENT_GONE`，无死信，源文件仍在磁盘（可恢复） |
| GC：活动源引用保护 | `activeSourceRef=true` → `eligible=false`，run(false) 后文件仍在 |
| GC：保留期内软删 → 到期删除 | 保留期内 `skippedReason=retained`；`retentionMs=0` 后 `eligible=true` → run(false) 删除 |
| GC：活动解析任务保护（GC 并发） | KB 软删但 pending job 仍在 → `activeJobRef=true` → 不删 |
| GC：孤儿扫描 | 老孤儿 `reason=orphan`+`eligible=true` → 删除；新孤儿保留 |
| GC：dry-run 安全 | dry-run 不删文件、报告不含正文；run(false) 才删除 |
| 临时文件 GC | 老 `docling_*` 目录 dry-run 不删 → run(false) 删除；新目录保留；`other_*` 不扫描 |

---

## 5. 测试结果

- **全量并行** `npx vitest run`：**58 文件 / 613 用例，全部通过（0 失败、0 跳过）**，EXIT=0。
  - 上一轮基线为 57 文件 / 599 用例；本轮 +1 文件（TB-3）+14 用例，无回归。
- **定向**：TB-3 单文件 14/14；phase2 单文件 12/12（含两条改为永久失败的原故障用例）。
- **typecheck**：`npx tsc --noEmit`（前端）→ clean；`npx tsc --noEmit -p tsconfig.backend.json`（后端）→ clean；新增/修改文件经 IDE 诊断确认无类型错误。

---

## 6. 要求逐条核对

1. ✅ Docling 错误分类区分永久/可重试（§2 矩阵 + 6 条分类测试）。
2. ✅ SOURCE_FILE_MISSING / SOURCE_HASH_MISMATCH / 超时 / 损坏 / 加密 / 依赖 的状态与错误码已核查并落测试。
3. ✅ 受控延迟 GC：软删立即撤销访问（既有读取路径过滤 `deleted_at` 不变），物理删除三重门（归属/保留期/活跃任务）。
4. ✅ 上传失败补偿（`parse-api.service` 既有 `removeSourceFile` 不变）、解析失败/取消/崩溃/重复解析的临时文件由 temp GC 清理、崩溃任务由 `reclaimExpired` 恢复。
5. ✅ GC 不误删活跃 documents/sources 引用、可恢复、或正在重试的文件（三重门 + 6 条 GC 测试自证）。
6. ✅ 图片副作用核查：Docling 提取图片写入 `DATA_DIR/images` 但**不登记** `document_images`；`/api/images/:name` 需 `isImageAccessible`（document_images 行 + 活跃文档 + 活跃 KB）→ 未登记图片 404，无法绕过授权；无 `documents.content` 字符串匹配鉴权。本阶段**不接入** document_images（仅验证 + 文档化）。
7. ✅ Phase 1 fenced commit / `lease_version` / `current_parse_job_id` / 任务取消保护**未改动**（相关文件未触碰，既有 phase1/phase2 栅栏用例全绿）。
8. ✅ 真实隔离测试覆盖：永久失败、可重试失败、取消、软删、保留期、GC 并发、重试、孤儿扫描。
9. ✅ 文件系统清理 dry-run 优先，报告不含敏感正文（§3 演示自证）。
10. ✅ 全量测试 + 两个 TS 类型检查通过（§5）。

---

## 7. 剩余风险

1. **GC 未接入调度**：受「不改公开 API」约束，两个 GC 为库模块 + 测试，未挂 cron/CLI/端点。后续可在一个**独立内部任务**（非公开接口）中定时以 dry-run 预热后切换实删。这是交付边界，非缺陷。
2. **分类→删除的窄窗口竞态**：文件在「分类」与「删除」之间被重新引用（例如软删后立刻 restore 且已过保留期）属极窄窗口；删除对象本就满足「已软删/孤儿 + 已过保留期」，最坏结果是该文件需重新上传，不会泄露或越权。
3. **孤儿保留锚点为 mtime**：无 DB 时间戳的孤儿以文件 mtime 计保留期，人工改动 mtime 可提前回收——但孤儿本无引用，风险可忽略。
4. **`docling.ts` 临时目录路径语义变化**：仅当设置了 `DATA_DIR` 时才改变落点（此前恒写 `./backend/data/tmp`），这正是修复意图；未设置 `DATA_DIR` 时行为不变。
5. **`retryable` 默认 true 的兜底**：任何遗漏抛点安全降级为「可重试」而非误终止，符合预期。
6. 本轮为**开发侧验证**，不代表 Codex 独立复审通过（Codex 无额度，与前几轮一致）。
