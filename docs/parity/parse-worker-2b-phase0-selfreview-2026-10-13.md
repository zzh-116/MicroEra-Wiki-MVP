# Phase 0 深度自检报告（开发侧）

- 日期：2026-10-13
- 结论：**开发侧自检通过**（注意：这不是「独立安全复审通过」——Codex 当前无额度，独立复审暂不可行）
- 范围：仅 `parse_jobs` 队列状态机 + fencing token + Worker 骨架。不写 documents/chunks/vectors/document_images，不运行 Docling，不动 entries/import-job.service，未 commit/push，迁移仅应用 `microera_wiki_test`。

---

## 1. 并发竞态逐项审计

| 原语 | 审计结论 | 证据 |
| --- | --- | --- |
| `claim`（CAS 认领） | ✅ 正确 | `UPDATE ... WHERE id=? AND status='pending'`。Postgres READ COMMITTED 下，条件 UPDATE 在取得行锁后重查 WHERE，两个 Worker 同时 claim 只有一个 `returning` 命中。测试：`claim is a compare-and-set` 断言第二者 `undefined`。 |
| `heartbeat`（续租） | ✅ 正确 | service 层先校验 `status==='running' && lease_owner===owner`，再 `guardedUpdate(id, owner, lease_version, {leaseExpiresAt})`。若 reclaim 已抢先 bump version，`guardedUpdate` 命中 0 行 → 抛 conflict。 |
| `checkpoint`（检查点） | ✅ 正确 | 同 heartbeat，走 `guardedUpdate`；fence 失效时抛 conflict（已有单测 + 补测）。 |
| `complete`（成功） | ✅ 正确 | `guardedUpdate` + 终态前置校验。旧 Worker 回收后无法 `complete`（补测断言 conflict）。 |
| `fail`（失败/死信） | ✅ 正确 | `guardedUpdate` + 终态前置校验；`attempt>=max` 时先写 deadletter 再 fence 写 failed。旧 Worker 回收后无法 `fail`（补测断言 conflict）。 |
| `cancel`（取消） | ⚠️ **发现确定性缺陷，已修复** | 原实现用无条件 `update`（WHERE id 仅），存在 read-then-write 竞态：`findById` 看到 running → Worker 并发 `complete` 成 succeeded → cancel 的无条件 update 把 succeeded 覆盖成 cancelled。**修复**：新增条件式 `repo.cancel`（`WHERE id AND status IN (pending,running)`），并发终态时返回 `undefined` → service 抛 conflict no-op。 |
| `reclaimExpired`（回收） | ✅ 正确 | `WHERE status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at < now`；状态守卫防止双重回收；每次 bump `lease_version`。 |

## 2. lease_version 版本重用 / 过期 Worker 写入

- **单调递增、永不重用**：`lease_version` 仅在 `claim` 和 `reclaimExpired` 两处通过 `sql\`${col} + 1\`` 递增；`retry` / `replayDeadletter` / `update` 均**不**触碰或重置它。故不存在版本号回绕重用的路径。
- **过期 Worker 无法更新任务状态**：所有 Worker 侧写路径（heartbeat/checkpoint/complete/fail）都经 `guardedUpdate(id, owner, lease_version, ...)`，WHERE 同时约束 owner + version + status='running'。旧 Worker 即使持有旧 version 的引用，回收后 version 已 +1，写入命中 0 行，被正确 fence 出去。
- **fencing 权威是 lease_version（非墙钟 lease_expires_at）**：complete/fail/heartbeat 在 reclaim 尚未触发时仍被允许，这是标准 fencing-token 设计（回收动作本身才翻 token），**不是缺陷**。若希望「到期即拒绝」，需在每次写前显式比对 `lease_expires_at`，但那会引入墙钟比较的脆弱性，且与 READ COMMITTED 的 CAS 语义冲突，不采纳。

## 3. Worker start/stop / 心跳 / 退出 / 异常

- **start/stop**：`loop()` 以 `while(running)` + `pollOnce()` + sleep 构成；`stop()` 置 `running=false`，循环在下次 sleep 后退出；`runOnce`/`runJob` 可独立调用。测试：`start/stop is graceful`。
- **心跳**：`runJob` 内 `setInterval(heartbeatMs)` 续租，`finally` 中 `clearInterval` 确保绝不泄漏；心跳失败不中断任务（Worker 只记录，最终 complete/fail 由 fence 兜底）。
- **进程退出**：`server/worker.ts` 捕获 SIGINT/SIGTERM → `stop()` → `closePool` → `exit(0)`；进程被 SIGKILL/崩溃时不清理，交由 `reclaimExpired` 回收（这正是 fencing 存在的意义）。
- **异常处理**：处理器抛错 → `fail(job.id, owner, message, 'PARSE_WORKER_ERROR')` → 依据 attempt 重试或死信；不会吞异常、不会虚假成功。默认处理器（未接线解析器）直接抛错，绝不伪成功。

## 4. 补充隔离测试（本次新增）

1. `an old worker recovering after reclaim cannot complete/fail via the service` —— 旧 Worker 在回收后经 service 层 `complete`/`fail` 均抛 conflict，任务保持 pending、owner 为空。
2. `cancel no-ops (returns undefined) on an already-terminal job` —— `repo.cancel` 对已 succeeded 任务返回 undefined，终态不被覆盖。
3. （单测）`parse_cancel is a no-op when the job turns terminal concurrently` —— service 层并发终态冲突。
4. （单测）`cancel is a no-op when the job turns terminal concurrently`（`jobService.cancel` 同路径）。

## 5. 本次实际修改文件（Phase 0 深度自检 + 最小修复）

- `backend/repositories/parse-job.repository.ts`：新增条件式 `cancel(jobId, tx?)`（`status IN (pending,running)` 守卫），返回 `ParseJobRow | undefined`。
- `backend/services/parse-job.service.ts`：`cancel` 改用 `repo.cancel`，`undefined` 时抛 conflict。
- `backend/services/job.service.ts`：`cancel` 改用 `repo.cancel`，`undefined` 时抛 conflict。
- `tests/parity/parse-job.test.ts`：mock 增加 `cancel`；`parse_cancel` 改为断言 `cancel` 调用；新增并发终态 no-op 单测。
- `tests/parity/model.test.ts`：`jobService.cancel` 单测改为 spy `cancel`；新增并发终态 no-op 单测。
- `tests/parity/parse-worker.test.ts`：新增 2 个隔离库补测（旧 Worker 回收后 service 层 fence、cancel 终态 no-op）。
- `docs/parity/parse-worker-2b-phase0-report-2026-10-13.md`：同步更新修改清单与测试计数。

## 6. 回归测试结果（真实）

- `npx vitest run` → **53 文件 / 556 用例，全部通过，0 失败、0 跳过**。
- `tsc --noEmit` 与 `tsc --noEmit -p tsconfig.backend.json` 均干净（0 错误）。
- 隔离库 `microera_wiki_test` 通过 `assertTestDatabase` 身份校验；无 TRUNCATE；唯一种子 + 定向清理；与 `parse-job-db.test.ts` 并行运行无竞态。

## 7. 结论边界

- **开发侧自检通过**：Phase 0 队列/fencing/Worker 骨架的并发正确性、fencing 语义、异常处理、隔离测试均已核对，发现的唯一确定性缺陷（cancel 无条件覆盖）已最小修复并回归通过。
- **独立安全复审**：未进行（Codex 无额度）。本报告不能、也不会冒充独立复审结论；待 Codex 可用时，将本报告 + 全部未提交改动作为复审输入。
