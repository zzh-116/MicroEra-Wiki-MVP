# MiqroEra Wiki 2b — 测试隔离收尾报告（全局 reclaimExpired() 竞态消除）

- 日期：2026-10-19
- 范围：仅测试基础设施 —— 消除 `parse-worker.test.ts` 与 `parse-phase1-e2e.test.ts` 中全局 `reclaimExpired()` 对其他并行 parity 文件的潜在干扰；不启动 TB-3、不改生产逻辑/Schema/API 契约
- 状态：未 commit、未 push；全部测试仅作用于 `microera_wiki_test`（`assertTestDatabase` 运行时保护保留）

---

## 1. 两个文件全部 reclaimExpired() 调用检查（要求 1）

| 位置 | 用途 | 处置 |
| --- | --- | --- |
| `parse-worker.test.ts:144` 专用用例 | **真正验证全局 `reclaimExpired()` 业务语义**：断言「过期 running job → pending、清租约、`lease_version` +1」，并断言返回结果中的版本号 | **保留**，但改为回滚事务内执行（见 §2.2），使其全局扫描永不落库 |
| `parse-worker.test.ts:188` setup | 「旧 Worker（stale lease_version）reclaim 后无法写」用例的前置：构造租约失效状态 | 改为按 `jobId` 定向回收 `reclaimJob(jobId)` |
| `parse-worker.test.ts:216` setup | 「旧 Worker reclaim 后经服务层 complete/fail 报 conflict」用例的前置 | 同上 |
| `parse-phase1-e2e.test.ts:220` setup | 「过期 Worker 无法写下游（LEASE_LOST）」用例的前置 | 同上 |

（`parse-job.test.ts:13/31` 的 `reclaimExpired` 为 `vi.fn()` mock，无 DB 访问，不在本轮范围内；`parse-phase2-docling-e2e.test.ts` 已在上一轮改为定向 `reclaimJob`。）

---

## 2. 隔离策略（要求 2、3、4）

### 2.1 setup 调用 → 基于唯一 jobId 的定向回收（要求 2）

两个文件各新增 `reclaimJob(jobId)` helper（与 `parse-phase2-docling-e2e.test.ts` 完全一致）：

```sql
UPDATE parse_jobs
   SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL,
       stage = NULL, lease_version = lease_version + 1, updated_at = now()
 WHERE id = $1 AND status = 'running'
```

该 SQL 是 `ParseJobRepository.reclaimExpired` 的**单行定向版**：语义等价（置回 pending + 版本 +1），但 `WHERE id = $1` 使其**只回收本 job**，绝不扫全表、绝不抢占其它文件刚过期的任务。三个 setup 调用（`parse-worker.test.ts:188/216`、`parse-phase1-e2e.test.ts:220`）全部替换为 `await reclaimJob(jobId)`。

### 2.2 专用用例 → 回滚事务内执行全局 reclaimExpired（要求 3）

专用用例仍调用**真实** `ParseJobRepository.reclaimExpired(new Date(), tx)`（生产逻辑零改动，满足要求 4），但把这次全局扫描包进一个**必然 ROLLBACK** 的事务：

1. `enqueue` → `claim(jobId,'w1',60)` → `UPDATE lease_expires_at = now() - 5s`（这些前置步骤正常 autocommit）；
2. `db.transaction(async (tx) => { reclaimed = await reclaimExpired(new Date(), tx); throw ROLLBACK; })` —— 全局 `UPDATE parse_jobs WHERE status='running' AND lease_expires_at < now` 在事务内执行；
3. 断言读事务内 `.returning()` 的结果（`status='pending'`、`lease_owner=null`、`lease_version=2`）；
4. `throw ROLLBACK` 触发整体回滚 —— 该次全局扫描对**共享 `parse_jobs` 表的所有修改（含其它并发文件刚过期 job 的回收）一律不提交**；
5. 额外断言提交后状态仍为 `running` + `lease_version=1`，**直接证明隔离生效**（全局扫描从未落库）。

由此满足要求 3 的硬约束：**不再「全局扫描共享测试库并修改其他用例数据」** —— 扫描仍在事务语义内发生（因此真实业务语义被完整验证），但任何对外部数据的修改都被回滚，其他文件连接在 MVCC 下始终只看到各自提交前的旧状态。无需新建独立 Schema、无需串行整个套件（对应要求「不无条件串行」），全部仍落在 `microera_wiki_test`。

### 2.3 保护不变（要求 5）

两个文件仍沿用既有自举模式：`assertTestDatabase` + `applyMigrations`（advisory lock 串行）+ `DATABASE_URL` 重指 + `vi.resetModules()`；只作用于 `microera_wiki_test`。

---

## 3. 修改文件（要求 8：不 commit/push）

| 文件 | 变更 |
| --- | --- |
| `tests/parity/parse-worker.test.ts` | 新增 `reclaimJob` 定向回收 helper；专用 `reclaimExpired` 用例改为**回滚事务**内执行并新增「提交后版本未变」隔离自证断言；两处 setup 由全局 `reclaimExpired()` 改为 `reclaimJob(jobId)`；新增 `db` 导入 |
| `tests/parity/parse-phase1-e2e.test.ts` | 新增 `reclaimJob` 定向回收 helper；一处 setup 由全局 `reclaimExpired()` 改为 `reclaimJob(jobId)` |

**未改动**：`backend/repositories/parse-job.repository.ts`、`backend/services/parse-job.service.ts`（生产 `reclaimExpired` 业务逻辑不动，要求 4）；任何 Schema/迁移/REST/CLI/MCP 契约；dev/NUC/腾讯云库。

---

## 4. 多轮测试结果（要求 6）

### 4.1 全量并行（`npx vitest run`，57 文件）

| 轮次 | 结果 |
| --- | --- |
| #1 | 57 文件 / **597 通过 + 2 跳过**（0 失败） |
| #2 | 57 文件 / **597 通过 + 2 跳过**（0 失败） |
| #3 | 57 文件 / **599 通过**（0 失败、0 跳过） |
| #4（最终，含强化断言） | 57 文件 / **599 通过**（0 失败、0 跳过） |

> #1/#2 的 2 个「跳过」为 `parse-phase2-docling-e2e.test.ts` 的两条**真实 bge-m3 向量**用例（Ollama `bge-m3` 期间不可达 → 环境门控跳过，日志 `embedding/ollama: fetch failed`）；Ollama 恢复后 #3/#4 即为 599/599 全通过。该跳过与本轮隔离改动无关。

### 4.2 定向压力

- **共享 `parse_jobs` 的 6 文件集群**（parse-job-db + parse-worker + phase1 + phase2 + source-file-upload + vector-retrieval）并行 × 7：**57/57 通过，7 次全部 0 失败**。
- **lease/reclaim 四文件集群**（parse-worker + phase1 + phase2 + parse-job-db）并行 × 10：**31/31 通过，10 次全部 0 失败**。
- 单文件/双文件隔离运行：parse-worker 11/11、parse-worker + phase1 16/16，均通过。

合计 **4 轮全量并行 + 17 轮定向集群并行 = 21 轮并行全绿**（0 失败；唯一「跳过」为 Ollama 环境门控）。

### 4.3 typecheck

- `npx tsc --noEmit`（前端）→ exit 0。
- `npx tsc --noEmit -p tsconfig.backend.json`（后端）→ exit 0。

---

## 5. 残余风险

1. **专用用例的瞬时行锁（可忽略，非数据风险）**：回滚事务内的全局 `UPDATE parse_jobs` 会对「恰在那一瞬间处于 running+过期」的其它文件 job 行加短暂行锁，事务在毫秒级内回滚即释放。最坏情况是其它文件一条定向 `UPDATE` 短暂等待（非失败、非死锁——其它文件只碰自己的 job，无锁环）。21 轮并行未观察到任何超时或失败。
2. **`tx as never` 类型断言**：`db.transaction` 回调的 `tx`（`PgTransaction`）与仓库方法签名 `DbClient = NodePgDatabase<typeof schema>` 类型不直接兼容，故以 `tx as never` 绕过类型系统；运行时两者查询接口完全一致（`.update()/.returning()`），21 轮运行已验证。测试文件不在此仓库任一 tsconfig 的 `include` 内，不会被 `tsc` 校验——如需更严格，可后续把 `DbClient` 放宽为兼容 `PgTransaction` 的联合类型（属后端类型改进，超出本轮测试隔离范围）。
3. **共享库全局读操作**（`deadletters()`/跨文件搜索）为既有设计，相关断言均为「存在性」或按自身 kb/doc id 过滤，21 轮并行未复现问题。

结论：`parse-worker.test.ts` 与 `parse-phase1-e2e.test.ts` 的全局 `reclaimExpired()` 干扰已消除——三处 setup 收敛为按 id 定向回收，唯一保留的全局语义专用用例改为回滚事务隔离（其全局扫描不再落库，并有断言自证）。生产 `reclaimExpired` 业务逻辑、Schema、API 契约均未改动；仅用 `microera_wiki_test`，未 commit/push。
