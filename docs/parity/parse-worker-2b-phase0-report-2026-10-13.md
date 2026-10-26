# MiqroEra Wiki 2b — Phase 0 Parse Job Worker 完成报告

- 日期：2026-10-13
- 范围：Phase 0（`parse_jobs` 租约回收 + fencing token + Worker 骨架），**不写 documents/chunks/vectors/document_images，不运行 Docling**
- 状态：代码与测试已完成；未 commit、未 push；迁移仅应用于隔离测试库 `microera_wiki_test`

---

## 1. 实际修改文件

### 新增

| 文件 | 作用 |
| --- | --- |
| `backend/db/migrations/0020_add_parse_job_lease_version.sql` | `parse_jobs.lease_version int NOT NULL DEFAULT 0`（fencing token） |
| `backend/services/parse-worker.service.ts` | `ParseWorker` 骨架：start/stop/runOnce/runJob/心跳/异常处理/回收集成，处理器可注入 |
| `server/worker.ts` | 独立 Worker 进程入口（`npm run worker`），优雅停机（SIGINT/SIGTERM drain） |
| `tests/parity/parse-worker.test.ts` | 隔离库真实验证（9 用例，无 TRUNCATE、唯一种子、定向清理） |

### 修改

| 文件 | 变更 |
| --- | --- |
| `backend/db/schema.ts` | `parseJobs` 新增 `leaseVersion`（`lease_version`）列 |
| `backend/repositories/parse-job.repository.ts` | `ParseJobRow`/映射加 `lease_version`；`claim` 递增版本；新增 `guardedUpdate`（owner+version+running 守卫）与 `reclaimExpired`（回收过期租约并递增版本）；新增条件式 `cancel`（`status IN (pending,running)` 守卫，防止覆盖终态） |
| `backend/services/parse-job.service.ts` | `retry` 重置 `attempt=0`（D3）；`cancel` 改走条件式 `repo.cancel`（并发终态时冲突 no-op）；`heartbeat/checkpoint/complete/fail` 改用 `guardedUpdate`；新增 `reclaimExpired()` |
| `backend/services/job.service.ts` | `jobService.cancel` 改走条件式 `repo.cancel`（并发终态时冲突 no-op，D4 修复） |
| `backend/config.ts` | 新增 `worker` 配置块（owner/concurrency/pollMs/leaseSeconds/heartbeatMs） |
| `package.json` | 新增 `"worker": "tsx server/worker.ts"` |
| `tests/parity/parse-job.test.ts` | 单测 mock 从 `update`/`releaseLease` 切到 `guardedUpdate`，并断言 `retry` 重置 attempt |

---

## 2. 迁移情况

- **新增迁移**：`0020_add_parse_job_lease_version.sql`（纯增量单列，不改现有数据）。
- **应用范围**：仅在 `microera_wiki_test` 隔离测试库由测试套件 `applyMigrations` 应用（advisory lock 串行）。
- **未应用**：开发库（5432/microera_wiki）、NUC、腾讯云数据库**均未迁移**，符合边界要求。生产迁移需另行授权。
- **回滚**：`ALTER TABLE parse_jobs DROP COLUMN lease_version`。

---

## 3. 测试结果（真实）

- **全量回归**：`npx vitest run` → **53 文件 / 556 用例，全部通过，0 失败、0 跳过**（含既有 52 文件 + 新增 1 文件）。
- **Phase 0 套件**（`parse-worker.test.ts`，隔离库 `microera_wiki_test`，未跳过）：11 用例全绿，覆盖：
  1. `claim` CAS 单认领（多 Worker 竞争）
  2. `reclaimExpired` 崩溃回收 + 版本递增
  3. 旧 Worker 失效（stale `lease_version` 写入 0 行，新 Worker 接管完成）
  4. 旧 Worker 回收后经 service 层 `complete`/`fail` 均冲突（补测：旧 Worker 恢复重写场景）
  5. `cancel` 对已终态任务返回 `undefined`（补测：不覆盖 succeeded）
  6. `parseJobService.cancel` 取消 + 释放租约 + 旧 Worker 守卫失效
  7. `jobService.cancel` 释放租约（D4）
  8. `retry` 重置 attempt（D3）
  9. `runJob` 成功（注入 no-op 处理器）
  10. `runJob` 处理器抛错 → 死信
  11. `start/stop` 优雅（concurrency 0 不触达任何 job）
- **typecheck**：`tsc --noEmit`（lint）与 `tsc --noEmit -p tsconfig.backend.json` 均干净。

---

## 4. 与边界的一致性

- **与 P1-B 图片业务完全解耦**：Worker 仅依赖 `parse-job.service` + repository，不导入 Docling、不写 documents/chunks/vectors/document_images。
- **不运行 Docling**：独立入口默认处理器直接抛错，绝不虚假成功；真实解析器（Docling/ingest）留待 Phase 1。
- **不动 entries 旧版导入系统**：`import.service.ts`、`import-job.service.ts` 及 `entries` 一族零改动（`git status` 无这两个文件）。
- **未 commit / 未 push**：全部改动保留在工作区，供 Codex 复审。

---

## 5. 未完成事项（Phase 0 边界内）

1. **无真实解析器接线**：Worker 处理器为可注入占位，默认抛错 —— 属 Phase 1（Docling/ingest + 文本消费）。
2. **下游一致提交（fence 事务）**：Q1 讨论的「把 elements/chunks/publish/images 并入带 fence 的单事务」是 Phase 1 的下游写防护；Phase 0 仅 fence `parse_jobs` 状态机（对队列骨架正确）。
3. **D6 未处理**：`JobStatusView` 仍不暴露 `checkpoint`/`lease_expires_at`/`lease_version`（观测性，超出本轮 7 项）。
4. **`server/worker.ts` 不自跑迁移**：假定 schema 已由 server 迁移，避免双进程迁移竞态。
5. **生产迁移 0020 待授权**：仅测试库已应用。

---

## 6. 是否可交给 Codex 复审

**可以。** Phase 0 的队列 + fencing + Worker 骨架与 P1-B 图片业务完全解耦，可独立复审；不依赖 P1-B 复审结论。审查重点建议：`guardedUpdate` 守卫条件、`claim`/`reclaimExpired` 的版本递增、`fail`/`cancel` 的租约释放路径、以及 Worker 的心跳/停机语义。
