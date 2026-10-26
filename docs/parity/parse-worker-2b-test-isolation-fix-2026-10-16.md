# MiqroEra Wiki 2b — 测试隔离修复报告（parse_jobs 共享库竞态）

- 日期：2026-10-16
- 范围：仅测试基础设施 —— 消除 `parse-job-db.test.ts` 与其他 parity 文件并行共享 `microera_wiki_test` 时对 `parse_jobs` 的竞态；不启动 TB-3、不改生产逻辑/Schema/API 契约
- 状态：未 commit、未 push；全部测试仅作用于 `microera_wiki_test`（`assertTestDatabase` 运行时保护保留）

---

## 1. 竞态根因

`tests/parity/parse-job-db.test.ts` 是**唯一**一个对共享 `microera_wiki_test` 库执行破坏性 `TRUNCATE "parse_jobs", "parse_deadletters"` 的文件，且其三个用例都通过 `parseJobService.lease(owner, 5)`（= `listPending(5)` 全局取**最旧 5 条 pending** 再逐条 `claim`）来认领自己刚入队的 job。由此产生两个方向的干扰：

1. **破坏性清空**：`beforeAll` 的 `TRUNCATE` 会删除其它并发文件（parse-worker / phase1 / phase2 / source-file-upload / vector-retrieval 等）正在进行中的 pending/running 任务，使其 `findById`/status 断言偶发落空。
2. **全局排序认领**：`lease(owner, 5)` 依赖「全局最旧 5 条 pending 恰好含自己刚 enqueue 的 job」。在其它文件并发 enqueue 时，该 job 不在最旧 5 条内 → `leased.find(...)` 为 `undefined`（曾观察到的 `mine` undefined 失败）；同时 `lease` 还会**抢占**其它文件的 pending 任务（标记为 running/占用 owner）。

其它 DB 测试文件（`parse-worker.test.ts` 等）早已采用正确隔离模式：唯一随机 job id + 按 `id` 精确 `claim` + 定向 `DELETE` 清理 + 无 TRUNCATE。`parse-job-db.test.ts` 是唯一的例外。

## 2. 修复方式

**`tests/parity/parse-job-db.test.ts`（主要修复）**
- 删除 `beforeAll` 中的 `TRUNCATE "parse_jobs", "parse_deadletters"`。
- 三个用例将 `parseJobService.lease(owner, 5)` + `find` 全部改为 `parseJobRepository.claim(job_id, owner, 60)`（按 id 精确认领，不触碰全局列表）。
- 新增 `createdJobIds` 追踪 + `afterAll` 定向 `DELETE ... WHERE id = ANY(...)`（对齐 `parse-worker.test.ts` 的清理模式）。
- 更新文件头注释：由「truncate 保持确定性」改为「唯一行 + 定向清理 + 按 id 认领」。

**`tests/parity/parse-phase2-docling-e2e.test.ts`（TB-2 测试自身的共享状态冲突，要求 4）**
- 将 lost-lease 用例中的全局 `parseJobService.reclaimExpired()` 替换为 `reclaimJob(jobId)`：一条按 `id` 定向的 SQL，仅把**本 job** 置回 pending 并 `lease_version+1`，语义等价于 `reclaimExpired` 单行版本，但**不再扫全表**，避免抢占其它文件刚过期的任务。

## 3. 修改文件

| 文件 | 变更 |
| --- | --- |
| `tests/parity/parse-job-db.test.ts` | 去 TRUNCATE、精确认领（claim 替代全局 lease）、定向清理、注释更新 |
| `tests/parity/parse-phase2-docling-e2e.test.ts` | 新增 `reclaimJob` 定向回收 helper，替代全局 `reclaimExpired` |

未改动任何生产代码、Schema、迁移、REST/CLI/MCP 契约。未迁移开发库/NUC/腾讯云。

## 4. 多轮测试结果（全量并行）

- 修复后**全量并行** `npx vitest run` × 3：**57 文件 / 599 用例，全部通过（0 失败、0 跳过）**，三次均 `EXIT=0`。
- **定向压力**：6 个共享 `parse_jobs` 的文件（parse-job-db + parse-worker + phase1 + phase2 + source-file-upload + vector-retrieval）并行 × 5：**6 文件 / 57 用例，全部通过**，五次均 `EXIT=0`。
- 合计修复后 **8 轮并行全绿**（3 全量 + 5 定向集群）。
- `npx tsc --noEmit`（前端，含测试文件）→ 干净（exit 0）。

## 5. 残余风险

1. **全局 `reclaimExpired()` 的窄窗口竞态（先验存在，本轮未触及的两个文件）**：`parse-worker.test.ts`（第 136 行专用用例 + 第 150/178 行 setup）与 `parse-phase1-e2e.test.ts`（第 206 行 setup）仍调用全局 `reclaimExpired()`。若 A 文件在「`UPDATE lease_expires_at=过去` → `reclaimExpired()`」的 ~1–2ms 窗口内，B 文件的 `reclaimExpired()` 恰好扫到 A 刚过期的那条 job，则 A 的专用用例 `reclaimed.find(id).lease_version === 2` 会因 `reclaimed` 不含该 job 而偶发失败。概率低（需两文件同时处于 expire→reclaim 窗口且精确交错），8 轮并行未复现；TB-2 测试已不再参与此竞态。**建议后续**：把上述两文件的 setup 用 `reclaimExpired` 同样改为按 id 定向回收，仅保留 `parse-worker.test.ts:136` 一个专用用例作为唯一全局调用方。
2. **共享库全局读操作**（`listDeadletters`/`deadletters`、跨文件全局搜索）为既有设计：相关断言均为「存在性」或按自身 kb/doc id 过滤，未使用全局计数，8 轮并行未复现问题。

结论：`parse-job-db.test.ts` 的 TRUNCATE + 全局 lease 竞态已消除；TB-2 测试自身的共享状态冲突已收敛为定向操作；残余仅剩两个先验文件的窄窗口 `reclaimExpired` 竞态，已记录并给出后续建议。
