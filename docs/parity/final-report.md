# MicroEra Wiki — 最终验收报告（final-report.md）

> 生成时间：2026-10-12 ｜ 本地 HEAD：`d2e0f306f1df98ac1a72969ebe8696989c378d3d`
> 判定：`ok = true`，功能得分 **86/100**，操作 parity **162/162**
> 说明：本报告所有数字来自真实执行（冻结校验器输出、真实日志哈希、真实退出码、真实外部 API 复验）。未推送 GitHub、未修改生产数据库、未伪造任何测试结果。

---

## 0. 本轮变更要点（相对 67d76a6 基线）

1. **Agent IDOR 对象级权限修复（commit `d2e0f30`）**：所有 `agent_id`/`run_id` 寻址操作在服务边界按已认证 JWT 用户做归属校验，未授权访问返回 `resource_not_found`（不泄露资源存在性）；REST/CLI/MCP 三条传输链路统一无法绕过（`tests/parity/agent-auth.test.ts`）。
2. **D01 外部源证明复验**：CrossRef 与 arXiv 均**本轮实网复验通过**（arXiv 改用官方 https 端点后返回真实 Atom 记录，修正了上一轮 http 端点空响应的记录）。
3. **job.list / job.view 证据修正**：正负测试证据从（未覆盖它们的）`model.test.ts` 改为真实集成测试 `tests/parity/job-e2e.test.ts`（Batch B F1 引入）。
4. 重新生成全部验收证据并重跑冻结校验器：结论仍为 **ok=true, 86/100, 162/162**。

---

## 1. 完成项（本轮实测，HEAD d2e0f30）

### 1.1 功能覆盖（G1）
- 51 项能力中，**41 项「必须」能力全部 accepted**（权重合计 86）；10 项「stretch」能力 blocked（权重合计 14）。
- 核心五域（K/R/C/A/W）均 ≥ 60%：K 87.5%、R 82.4%、C 92.3%、A 92.9%、W 83.3%。

### 1.2 操作覆盖（G2）
- **162 个必需操作全部通过校验**：`status=passed`、`result=passed`，`handlerFile`/`cliFile`/`mcpFile`/`schemaFile`/`positiveTestFile`/`negativeTestFile` 均指向仓库内真实文件，`logFile`（`npm-test.log`）哈希与 `outputLogHash` 一致，`mcpTransports` 同时含 `stdio` 与 `http`。
- 额外注册 1 个 `auth.whoami`（`transport=local`，身份自省，不计入 MCP 工具）。MCP `tools/list` 实测 **162 个工具**。
- 26 个 `required=false` 可选操作**未注册**（诚实 blocked，见 §3）。

### 1.3 实测验证（G3 / G4 / G5）
| 命令 | 退出码 | 结果 | 日志哈希（sha256） |
|---|---|---|---|
| `npm test` | 0 | **491 passed（46 文件），0 failed，0 skipped** | `f5b42f7689ec83c34caab218a6a72e1871d4efd32b69d6f8e0a47be9bcb05bb1` |
| `npm run test:e2e` | 0 | **19 passed（3 文件）** | `573e44dd65a0b8d1a5664507d2e1c468a764b8519eea202cd6e9a008376ceb80` |
| `npm run lint`（tsc --noEmit） | 0 | clean | `a6b21efd55cdba93c857a8b986c6aa67f41a33d644c5aa05f06a0a0ec4bcb73d` |
| `npm run typecheck:backend` | 0 | clean | `549b7ec15a4570ac9e1e28e2fb0c6bb79ce5b90d35e5481b2adc9a119b123945` |
| MCP 双 transport tools/list | 0 | 162 tools + 6 resources + 5 prompts | `0700d50fc8fbdbc0f5f902f72c0ff0e38cd7cd7429a5ea01b54d7a626954000c` |
| `evaluate_delivery.py` | 0 | ok=true, 86/100 | `46e3cda9a48d352d69b10cb68a9642d58be760be148ff96dc0ca26f80a90bd53` |

- `npm test` 中的 CLI/MCP 非绕过测试（`agent-auth.test.ts`）与真实 CLI 子进程测试（`cli-e2e.test.ts`、`job-e2e.test.ts`）覆盖了 REST/CLI/MCP 三面授权与真实调用路径。

### 1.4 Agent IDOR 修复后的对象级归属校验
- 修复入口（按 `agent_id`/`run_id` 寻址）：`agent.view/list/update/delete/run/tools/tool_call/mcp_list/mcp_call/sandbox_run/artifact_list/status/check/stop`、`agent.resume/trace/tool_result/artifact_list(run_id)/stop(run_id)`、`session.agent_ask`。
- 实现位置：`backend/services/agent.service.ts`（`userId` 首参 + `view()`/`requireOwnedRun()` 归属校验）、`backend/repositories/agent.repository.ts`（`listAgents(userId)` + `findRunWithOwnerById` JOIN）、`server/routes/agent-v2.ts`（`uid(req)` 取自校验后 JWT，不信任客户端 `user_id`）。
- 证据：`tests/parity/agent-auth.test.ts`（13 服务层负向 + 4 传输层防绕过：401 未认证、REST owner 200/非 owner 404、MCP handler 404、CLI 非零退出）。

---

## 2. 失败项 / 未重跑项（诚实记录）

### 2.1 历史 smoke* E2E 层（上一会话 67d76a6，本轮未重跑）
上一会话执行的 smoke* E2E（legacy 4/4、introspection 13/13、search 31/31、eval 15/15、model 20/20、knowledge 32/32、chat 26/26、wiki 25/25、agent 31/31、datasource 17/18）合计 **214 通过 / 1 失败**。唯一失败为 `datasource.sync imports 3 docs`（幂等性断言缺陷，非功能缺陷：`total=3, created=0, skipped=3`——样例文档已在先跑中导入，去重正确判为 skipped）。这些脚本依赖实时开发库 + Ollama + 后端，**不在本轮要求的重跑清单内**（本轮要求为 `npm test`/`test:e2e`/`lint`/`typecheck:backend` + CLI/MCP 验证），故本轮未重复执行；其结论与日志已随 `67d76a6` 证据归档于 `docs/parity/history/67d76a6-2026-10-12/`。`datasource.sync` 幂等性断言修复仍需用户授权改测试代码。

### 2.2 F2 Job 双后端语义分裂（维持现状，未修复）
- `job.list`/`job.view` → `GET /api/pipeline/jobs[/:id]`（`server/routes/pipeline.ts`，遗留 import 追踪器 `importJobService`，进程内内存态）。
- `job.wait/cancel/retry/events/artifacts` → `/api/v2/ops/job/*`（`server/routes/job-v2.ts`，持久化 `parse_jobs` 队列 `jobService`）。
- `job.parse_status/parse_retry/parse_cancel/deadletters/replay_deadletter` → `server/routes/knowledge-v2.ts`。
- 三个后端语义不同步（list/view 看到的是 import 追踪器，wait/cancel 操作的是 parse_jobs 队列）。冻结 CSV 中 job.list 声明路径 `/api/v2/ops/job/list` 与实现 `/api/pipeline/jobs` 不一致。**按用户决定维持现状，最终报告如实说明，不实施 F2 迁移。**

### 2.3 已知非阻塞限制（沿用 state.json 自述）
- `parse_jobs` 无自动 worker（进程内/DB 持久化 worker 接口保留）。
- `_migrations` 存在一条孤儿账目 `0002_layered_context.sql`。
- AutoWiki `generate()` 为对检索命中的确定性摘要合成，未走 LLM 实体/声明抽取（P5 简化）。
- Agent `run()` 为固定「retrieve→answer」两步，非可循环 ReAct；sandbox 为 in-process 模式（P6 简化）。E1（工具白名单）/E4（resume 幂等）/E5（sandbox 诚实声明）已修复，但两步式与进程内沙箱边界仍保留并如实标注为 capability_limits。
- CLI `--profile` 为 no-op 桩。
- `mcp serve --transport http` 参数吞并 bug **已于 Batch A 修复**：`cli/src/args.ts` `parseArgs` 不再吞掉 `--transport`/`--port`，`cli/src/main.ts` 将 `parsed.tokens.slice(1)` 传给 `runMcpServe`，`packages/mcp/src/index.ts` `runMcpServe` 正确解析 `--transport`/`--port`。**本轮实网复验**：`microera mcp serve --transport http --port 18765` 正常启动 HTTP server（initialize 返回 microera 0.1.0，`tools/list` 返回 162 tools），验证记录 `docs/parity/testlogs/mcp-serve-http-flag.log`（sha256 `83c214d9…`）。

---

## 3. 未完成项 / blocked

| 能力 | 原因 | 权重 |
|---|---|---|
| K05 / P05 / R05 / R07 / C06 / A07 / W05 / D03 / M02 / O02 | 规划包声明 `required=false` 的可选操作（tags×5、parser×3、chunk.parent/children、search.multi_kb、session.fork/rewind、memory×3、wiki.refresh/stale/rebuild、datasource.extend/schema、embedding×2、trace×3），代码中**未注册** | 14 |

对应 26 个未实现可选操作：`kb.tag_list/tag_create/tag_update/tag_delete`、`doc.retag`、`parser.list/select/probe`、`chunk.parent/children`、`search.multi_kb`、`session.fork/rewind`、`agent.memory_list/memory_search/memory_clear`、`wiki.refresh/stale/rebuild`、`datasource.extend/schema`、`model.embedding_profiles/embedding_migrate`、`trace.list/view/export`。

外部服务：feishu 缺凭据（`external_unverified`，未伪造成功）；其余外部集成（CrossRef/arXiv 公开网络）已实网复验。

---

## 4. 源证据（source evidence）

| 证据 | 路径 | 哈希（sha256） |
|---|---|---|
| 单元测试日志（491 tests） | `docs/parity/testlogs/npm-test.log` | `f5b42f7689ec83c34caab218a6a72e1871d4efd32b69d6f8e0a47be9bcb05bb1` |
| E2E 日志（19 tests） | `docs/parity/testlogs/npm-test-e2e.log` | `573e44dd65a0b8d1a5664507d2e1c468a764b8519eea202cd6e9a008376ceb80` |
| lint 日志 | `docs/parity/testlogs/npm-lint.log` | `a6b21efd55cdba93c857a8b986c6aa67f41a33d644c5aa05f06a0a0ec4bcb73d` |
| typecheck 日志 | `docs/parity/testlogs/npm-typecheck-backend.log` | `549b7ec15a4570ac9e1e28e2fb0c6bb79ce5b90d35e5481b2adc9a119b123945` |
| MCP stdio tools/list | `docs/parity/testlogs/mcp-stdio.log` | `0700d50fc8fbdbc0f5f902f72c0ff0e38cd7cd7429a5ea01b54d7a626954000c` |
| MCP http tools/list | `docs/parity/testlogs/mcp-http-tools.log` | `0700d50fc8fbdbc0f5f902f72c0ff0e38cd7cd7429a5ea01b54d7a626954000c` |
| D01 外部源证明 | `docs/parity/testlogs/d01-source-proof.log` | `38c436d961deb5378bccc820d2f88f44cb9e9241bebb5c7f4c63fc0bb5b64bc0` |
| 冻结校验器输出 | `docs/parity/testlogs/evaluate-delivery.log` | `46e3cda9a48d352d69b10cb68a9642d58be760be148ff96dc0ca26f80a90bd53` |
| 162 op 验收证据 | `docs/parity/operations/<oid>.json` | 逐条含 `outputLogHash` |
| 51 cap 验收证据 | `docs/parity/evidence/<id>.json` | 逐条含 `outputLogHash` |
| 162 schema 物化 | `docs/parity/schemas/<oid>.json` | — |

D01 源证明（本轮实网复验，公开无鉴权）：CrossRef 真实返回 DOI `10.1038/nature12373` 论文「Nanometre-scale thermometry in a living cell」（Springer Science and Business Media LLC）；arXiv 官方 https 端点真实返回「The electronic structure of cuprates from high energy spectroscopy」（`http://arxiv.org/abs/cond-mat/0011267v1`，2000-11-15）。两者均为真实记录，未伪造。

---

## 5. 性能与资源（G5）

只读测量（5 次采样，curl `time_total`）：

| 端点 | p50 | p95 |
|---|---|---|
| GET /api/pipeline/health | 1.4 ms | 2.0 ms |
| GET /api/entries?page=1&pageSize=20 | 5.6 ms | 6.5 ms |
| POST /api/search (title) | 5.4 ms | 5.7 ms |

- 完整数据见 `baseline-performance.json`。此为**首个基线**，后续阶段可据此比较 P95 相对恶化。

---

## 6. Source integrity

- `docs/parity/frozen-spec/*.csv` 与规划包 `spec/` **逐字节一致**（`operation_registry.csv` sha256 `b187995a…`、`capability_matrix.csv` `a38106e9…`）。
- 权威判定使用规划包自带 `evaluate_delivery.py`（sha256 `688abc96…`，未修改评分标准/权重/门槛）。
- 证据生成脚本 `scripts/generate-evidence.ts` / `generate-reports.ts` 只读真实文件与 `git rev-parse HEAD`，不硬编码测试结果、不调整 accepted_points。
- 本轮对生成器的两处修正仅提升诚实性：`job.list`/`job.view` 测试证据指向真实集成测试 `job-e2e.test.ts`；D01 sourceProof 更新为本轮实网复验结果。

---

## 7. Commit 列表与工作区状态

- 当前 HEAD `d2e0f306f1df98ac1a72969ebe8696989c378d3d`（「Agent object-level authorization (IDOR fix)…」，6 文件 +332/−98）。本地提交清单见 `commit-ledger.md`。
- 本阶段新增/更新的证据与报告为**未跟踪文件**，未提交、未 push：`docs/parity/{operations,schemas,evidence,testlogs,history}`、`report.json`、`report.md`、`final-report.md`、`capability-report.json`、`operation-parity.json`、`commit-ledger.md`、`baseline-performance.json`，以及 `scripts/{generate-evidence.ts, generate-reports.ts, verify-mcp-transports.ts}` 与 `docs/parity/state.json`（未提交）。
- 未修改生产数据库、未删除真实业务数据、未实施 F2 迁移、未新增 Agent 框架、未停止 Wiki/WeKnora/Ollama。

---

## 8. 部署前配置

- 后端：`npm run server`（默认 3001，`.env` 指定 `DATABASE_URL=postgresql://postgres:***@localhost:5433/microera_wiki`）。
- 前端：`npm run dev`（Vite 3000）。
- 依赖服务：Ollama（`bge-m3` 嵌入、`qwen2.5:7b` 对话）、PostgreSQL + pgvector。

## 9. 回滚指令

- 本阶段未做任何生产/不可逆操作；写入型测试均在隔离环境（mocked 或临时循环回环、空文件快速失败）完成，不触碰既有业务数据。
- 历史验收证据已归档于 `docs/parity/history/67d76a6-2026-10-12/`（含 `MANIFEST.sha256`），如需回溯到 `67d76a6` 版本证据可直接从该目录恢复。

## 10. 遗留任务

1. 修复 `smoke-datasource.ts:75` 幂等性断言（需用户授权改测试代码）。
2. 补齐 10 项 stretch 能力（26 个可选操作未注册，按需排期）。
3. feishu 凭据到位后补真实集成 E2E。
4. F2 Job 双后端语义统一（需用户授权实施迁移，本轮明确不实施）。
