# MicroEra Wiki — 缺陷审计报告（基线）

> 审计时间：2026-10-12 ｜ 方式：只读代码核查 + 实测定向，未改业务代码
> 基线 HEAD：`67d76a6`（本地 main）
> 报告定位：本文件为「开发质量提升阶段」的缺陷基线，逐项记录严重程度、文件位置、复现条件、影响范围、修复建议与验证标准，并跟踪分批修复状态。

## 0. 历史验收结论状态标注

上一阶段（P0–P10 收尾）的权威验收器 `evaluate_delivery.py` 判定为：

- `accepted_points = 86/100`，`verified_operations = 162/162`，`operation_parity = true`，`ok = true`。

**自本轮缺陷排查起，上述结论标注为「待重新验证」**，不再作为已完全验证的最终交付结论使用。原因是本轮确认存在以下尚未修复、且会影响验收证据可信度的缺陷（详见 §2 的 HIGH 项）：`job.list`/`job.view` 无任何真实测试却被标 passed（F1）、`job.*` 命名空间指向两个后端（F2）、向量检索失败被静默降级（F3）、CLI 多个操作参数映射错误导致按文档用法无法执行（A1/D1/D2/D3）。

**批 A（CLI/MCP 参数处理）已于 2026-10-12 修复并回归通过**：A1/D1/D2/D3/D4/D5/D6 已 `verified`，D8 部分修复；对应回归测试 `tests/parity/cli-args.test.ts`（19 用例）与 `tests/parity/cli-e2e.test.ts`（7 用例，真实 CLI 进程）全部通过，全套测试 37 文件 408 用例无回归。§0 中依赖 A1/D1/D2/D3 的「按文档用法无法执行」问题已消除。

**批 B（job 语义 + 真实集成测试 + 测试入口）已于 2026-10-12 完成并回归通过**：B1（smoke-datasource 幂等断言）、C1（`npm run test:e2e` 入口）、F1（job.list/job.view 真实 API+CLI+MCP 集成测试）、F6（Provider Probe 成功/失败正负两路 + M01 view 正例）已 `verified`；F4/F5 部分补齐（新增真实 DB 的 parse-job worker 生命周期测试 `tests/parity/parse-job-db.test.ts`，复用既有的 chunk/elements 纯函数真实测试；ingest 全链路 DB+embed 测试延后记录）；F7 已记录（smoke-eval/smoke-knowledge 造数走进程内 service，原因与现状见 §2 F7）；F2 按用户要求**暂停**并提交设计与风险说明（见 §4）。批 B 还发现并修复一个新缺陷 F13（`ParseJobService.complete()` 把 `finished_at` 写成 snake_case，Drizzle 静默丢弃该字段 → 改为 `finishedAt`，由真实 DB 测试暴露）。全套测试 40 文件 424 用例通过。

**批 C（MCP 真实性 + 检索/错误可见性）已于 2026-10-12 完成并回归通过**：E2（`agent.mcpTest` 真实握手，去掉恒 `reachable:true`）、E3（`agent.mcpCall` 按 `server` 参数路由到真实 MCP 客户端，本地内置工具标注 `remote:false`）、F3（向量检索降级显式标记 + 日志，不再冒充完整向量结果）、F9（`PUT /entries/:id` 区分 not-found 404 与 DB 错误 500）、F10（rerank fallback 携带 `reason` + 告警日志）、F11（provider probe/流式失败可观测）已全部 `verified`；新增 MCP SSRF 防护（`backend/services/mcp-url-guard.ts`，阻断私有/保留/元数据地址，无 stdio/spawn 故无任意命令执行）与手写 Streamable HTTP MCP 客户端（`backend/services/mcp-client.ts`）。回归：`tests/parity/mcp-client.test.ts`、`agent-mcp.test.ts`、`search-degradation.test.ts`、`entries-route.test.ts`、`error-visibility.test.ts` 5 个新文件（35 用例）。全套测试 45 文件 459 用例、`npm run test:e2e` 19 用例、`tsc --noEmit` 全部通过。

**批 D（低优先缺陷 + Agent/Harness 分析）已于 2026-10-12 完成并回归通过**：安全独立修复——E6（`wiki.revert` 回写 `summary`，由 content 派生，最小兼容、不迁移）、D7（`eval.run` `risk:'read'`→`'write'`）、D8（补 `buildInput` 级 `--format xlsx` 断言，与既有 parseArgs 断言共同闭合）、F8（checkpoint 字段级断言）、F12（model/datasource/meta 四处弱断言补字段级断言）；Agent 三项 E1/E4/E5 按用户要求**只做设计与风险分析，未实施**（见 §5）。回归：`npm test` 45 文件 461 用例、`npm run test:e2e` 19 用例、`tsc --noEmit`（前端+全量）与 `typecheck:backend` 全部通过。批 D 独立本地提交（未 push）。

**批 E（Agent/Harness 剩余关键项 E1/E4/E5 最小兼容修复）已于 2026-10-12 完成并回归通过**：E1（`agent.run` 开始尊重 `agent.tools` 白名单——空数组=全部内置工具、非空=仅白名单、未知工具名报 `validation_failed` 不静默过滤；`agent.model`/`agent.instructions` 如实记录 `capability_limits`，instructions 作为上下文注入但明确声明确定性合成器无法保证真正遵循，不宣称指定模型已执行；`run`/`toolCall`/`mcpCall` 本地内置路径统一白名单校验；不泄露 API Key/Token）、E4 Option A（`agent.resume` 对 `succeeded` 幂等返回既有结果且**不新建 run/不重跑 retrieve/synthesize**，对 `failed`/`cancelled`/`running`/状态不明确返回 `conflict` 类型化错误；不新增 DB 字段、不实施 checkpoint 状态机）、E5（`sandboxStatus` 增补 `isolated:false`/`isolation:'none'`/`capabilities` 白名单，明确 in-process 无 OS/容器隔离）。同步更新 operation registry（`agent.run` outputSchema +`capability_limits`；`agent.sandbox_status` outputSchema +隔离字段；`agent.resume` 描述注明「只读已完成结果、不支持 checkpoint 续跑」，并将 `kind`/`risk`/`readOnlyHint`/`scopes` 由 write/mutation 改为 read/query 以如实反映只读语义）。回归：`npm test` 45 文件 474 用例、`npm run test:e2e` 19 用例、`tsc --noEmit` + `typecheck:backend` 全部通过。批 E 独立本地提交（未 push）。

**批 D Phase 1 历史证据核对结论**：162 个必需操作（`docs/parity/operations/*.json`）与 51 项能力（41 接受 / 10 blocked）在批 A/B/C 改动后**数量与覆盖不变**——批 A/B/C 未新增/删除/重命名任何操作或能力。但历史验收证据（`operation-parity.json`、`capability-report.json`、`report.json`、`operations/*.json`、`evidence/`、`testlogs/`）**快照于 `commitSha 67d76a6`（批 A/B/C 之前的收尾 HEAD）**，其 `commitSha` 字段、`npm-test.log` 哈希（旧 382 测试）与个别 `testFile` 指向（如 `job.list`/`job.view` 仍指向修复前的 `tests/parity/model.test.ts`，即 F1 修复前状态）均已滞后于当前 HEAD。故**旧 86/100 不作为当前最终验收结论**；需在批 D 收尾后重新生成验收证据并重跑权威校验器（`evaluate_delivery.py`）方可恢复「已完全验证」终态。

在批 D 修复并回归后，需重新生成验收证据并重跑权威校验器，方能恢复「已完全验证」的终态判定。

## 1. 概览

| 领域 | HIGH | MEDIUM | LOW | 小计 |
|---|---|---|---|---|
| ① MCP HTTP 参数解析 | 1 | 0 | 0 | 1 |
| ② datasource.sync 幂等断言 | 0 | 1 | 0 | 1 |
| ③ test:e2e 入口缺失 | 0 | 1 | 0 | 1 |
| ④ API/CLI/MCP 一致性 | 3 | 2 | 3 | 8 |
| ⑤ AutoWiki / Agent / Harness | 0 | 3 | 3 | 6 |
| ⑥ 测试质量 / 证据 | 3 | 4 | 5 | 12 |
| **合计** | **7** | **11** | **11** | **29** |

已排除（干净）：162 个 `http.path` 全部有挂载路由（无死端点）；MCP tool 名与 registry 一致；无 stub/not-implemented 路由；`tests/parity/*` 负例统一 `rejects.toMatchObject({kind})` 且断言具体错误类型，无吞错式 try/catch。

---

## 2. 缺陷清单

> 状态图例：`open`（待修复）／`fixing`（修复中）／`fixed`（已修复待回归）／`verified`（回归通过）。

### ① MCP HTTP transport CLI 参数解析

#### A1 `microera mcp serve --transport http --port N` 静默起 stdio — HIGH
- **文件位置**：`cli/src/main.ts:45-51`（`parseArgs` 吞掉所有 `--flag`）、`cli/src/main.ts:182-184`（`runMcpServe(parsed.command.slice(1))` 只传 `['serve']`）、`packages/mcp/src/index.ts:8-12`（argv 缺 `--transport`，默认 stdio）。
- **复现条件**：`npm run mcp:http`（即 `tsx cli/src/main.ts mcp serve --transport http`）后端口 8765 无 HTTP 监听，进程走 stdio。
- **影响范围**：HTTP MCP transport 无法经 CLI 选中；`cli/src/main.ts:154` 却宣称 `supportedTransports:['stdio','http']`。REST/直接调 `runHttpServer(8765)` 正常（162 tools），纯 CLI 接线缺陷。
- **修复建议**：CLI 将 `--transport`/`--port` 原样转发给 `runMcpServe`；`runMcpServe` 同时支持 `--transport http` 与 `--transport=http` 两种写法。
- **验证标准**：`tsx cli/src/main.ts mcp serve --transport http --port <随机端口>` 后向 `/mcp` 发 JSON-RPC `tools/list`，返回 ≥150 tools 且含 `search_hybrid`。
- **状态**：`verified`

### ② datasource.sync 幂等断言

#### B1 smoke 断言 `created === 3` 依赖干净库 — MEDIUM
- **文件位置**：`scripts/smoke-datasource.ts:75`。
- **复现条件**：共享 dev 库已有既往导入（本地 connector 3 份样例文档已存在）时，`npx tsx scripts/smoke-datasource.ts` 第 18 步 `datasource.sync imports 3 docs` 恒失败。实测 `total=3, created=0, skipped=3, failed=0`。
- **影响范围**：仅 smoke 测试断言错误；同步/去重/cursor 增量逻辑本身正常（非功能缺陷）。
- **修复建议**：断言改为幂等（接受 `created + skipped === 3`）或在隔离库上运行。
- **验证标准**：`smoke-datasource` 在已导入与干净库两种状态均通过。
- **状态**：`verified`（批 B）— `scripts/smoke-datasource.ts:74-80` 已改为幂等断言 `created + skipped === 3`。

### ③ test:e2e 入口缺失

#### C1 无统一 `npm run test:e2e` 入口 — MEDIUM
- **文件位置**：`package.json`（仅有 `test`/`test:coverage`/`smoke*`，无 `test:e2e`）。
- **复现条件**：`npm run test:e2e` 报 unknown script。
- **影响范围**：规划 G5 门禁第 5 条要求新增统一 E2E 入口；当前靠手工逐个 `tsx scripts/smoke-*.ts`。
- **修复建议**：新增 `test:e2e` 脚本聚合各 smoke。
- **验证标准**：`npm run test:e2e` 一键执行并汇总通过/失败。
- **状态**：`verified`（批 B）— `package.json` 新增 `test:e2e`，聚合 cli-e2e / job-e2e / model-probe，19 用例通过。

### ④ API/CLI/MCP 功能与行为一致性

#### D1 `chat.references` 无法传必填 `message_id` — HIGH
- **文件位置**：`cli/src/main.ts:98`（`buildInput` 返回 `{conversation_id}`，键名错误且忽略 `--message-id`）；schema `packages/operation-registry/src/operations.ts:1388`（required `message_id`）；`server/routes/chat-v2.ts:73-75` 读 `message_id`。
- **复现条件**：`tsx cli/src/main.ts chat references --message-id msg_...` 后端收到空 body，操作恒失败/空。
- **影响范围**：该 CLI 操作完全不可用（REST/MCP 正常）。
- **修复建议**：`--message-id` → `message_id`，删掉手写特判，交给通用 schema 映射。
- **验证标准**：真实 CLI 调用经 mock server 捕获 body 含 `message_id`。
- **状态**：`verified`

#### D2 9 个读/搜操作位置参数被静默丢弃 — HIGH
- **文件位置**：`cli/src/main.ts:118-133`（通用分支只映射 flags，不消费位置参数）。
- **复现条件**：`search.vector/lexical/explain/filtered`、`chat.stream`、`session.ask`、`message.search`、`wiki.search`、`graph.search` 按 registry 示例用位置参数传 query（如 `microera search vector "MOF"`），后端收到空 query。
- **影响范围**：9 个文档化 CLI 命令按示例用法失败。
- **修复建议**：通用分支把首个位置参数映射到「首个 required 字符串字段」（query/question/q）。
- **验证标准**：真实 CLI 调用经 mock server 捕获 body 含 `query`/`question`/`q`。
- **状态**：`verified`

#### D3 `chat.ask` 丢 `kb_ids/session_id/top_k/method/is_internal`，且 `session_id` 错映射为 `conversation_id` — HIGH
- **文件位置**：`cli/src/main.ts:97` vs schema `operations.ts:1351-1361`、`server/routes/chat-v2.ts:62-68`。
- **复现条件**：`microera chat ask "..." --kb-ids 1 --method hybrid --session-id sess_...` 时范围过滤静默失效、session 关联丢失。
- **影响范围**：检索范围/会话上下文被静默丢弃，返回错误结果而非报错。
- **修复建议**：删掉手写特判，交给通用 schema 映射（含 `kb_ids` 数组解析）。
- **验证标准**：mock server 捕获 body 含 `kb_ids:[1]`、`method:'hybrid'`、`session_id`。
- **状态**：`verified`

#### D4 `search.hybrid` 丢 `kb_id/folder_id/is_internal/rrf_k` — MEDIUM
- **文件位置**：`cli/src/main.ts:96`（只保留 `{query, top_k}`）；schema `operations.ts:977-987`。
- **复现条件**：`microera search hybrid "MOF" --kb-id 1 --rrf-k 60` 时过滤与 RRF 参数丢失。
- **影响范围**：过滤静默失效。
- **修复建议**：删掉手写特判，交给通用 schema 映射。
- **验证标准**：mock server 捕获 body 含 `kb_id`、`rrf_k`。
- **状态**：`verified`

#### D5 数组 flag 强制 `Number` 转换破坏 JSON/空格/非数值数组 — MEDIUM
- **文件位置**：`cli/src/main.ts:128`（`split(',').map(Number).filter(Number.isFinite)`）。
- **复现条件**：`search.rerank --documents '[{"text":"a"}]'` → `[]`；`--kb-ids "1 2"` → `[1]`；`eval.compare --run-ids eval_1 eval_2` → `[]`。
- **影响范围**：对象数组、空格分隔数组、字符串数组全部被破坏。
- **修复建议**：按 `items.type` 分派：object/array → JSON.parse；integer/number → 逗号+空白拆分后 Number；string → 保留字符串；boolean → 布尔。
- **验证标准**：单测覆盖 JSON 数组/数字数组/字符串数组/含空格参数四类。
- **状态**：`verified`

#### D6 datasource `projectId/dryRun` 用 camelCase 且 `--dry-run` 被全局吞 — LOW
- **文件位置**：`cli/src/main.ts:39`（全局 `--dry-run`）、`operations.ts:2652,2672`（`projectId`/`dryRun`）、`backend/services/datasource.service.ts:16,83`。
- **复现条件**：`microera datasource sync --datasource-id 1 --dry-run` 的 `--dry-run` 被全局消费，未落到 `input.dryRun`；`--project-id` 无映射。
- **影响范围**：datasource 预览/同步的过滤与 dry-run 语义在 CLI 不可达。
- **修复建议**：通用映射支持 kebab→camelCase；`--dry-run` 在 schema 含 `dryRun` 字段时同步写入 input。
- **验证标准**：mock server 捕获 body 含 `projectId`/`dryRun`。
- **状态**：`verified`

#### D7 `eval.run` 元数据 `risk:'read'` 但实际写库 — LOW
- **文件位置**：`operations.ts:1278` vs `backend/services/eval.service.ts:159`（`createRun`）。
- **复现条件**：`eval.run` 创建持久 eval 记录但风险元数据标 read（`readOnlyHint` 已正确为 false）。
- **影响范围**：元数据自相矛盾，审计/权限脚本可能误判。
- **修复建议**：`risk` 改为 `write`。
- **验证标准**：`eval.run` 的 `risk` 与 `mcp.readOnlyHint` 一致。
- **状态**：`verified`（批 D）— `operations.ts:1278` `eval.run` 的 `risk` 由 `read` 改为 `write`，与 `mcp.readOnlyHint:false` 一致；回归 `tests/parity/meta.test.ts` 新增 `api.schema exposes eval.run risk=write consistent with mcp.readOnlyHint=false`。

#### D8 全局 flag 与 op 输入字段命名冲突 — LOW
- **文件位置**：`cli/src/main.ts:37-39`（全局 `--format`/`--timeout`/`--dry-run`）、`operations.ts:572`（`kb.export.format`）、`operations.ts:2672`（`datasource.sync.dryRun`）。
- **复现条件**：`kb.export --format <值>` 的 `--format` 被当作全局输出格式而非导出格式。
- **影响范围**：`kb.export.format`（可选字段）经 CLI 不可达。
- **修复建议**：全局 `--format` 仅在取值为 `json|ndjson|text` 时视为全局，其余透传给 op；并记录其余冲突。
- **验证标准**：`kb.export --format xlsx` 时 body 含 `format:'xlsx'`。
- **状态**：`verified`（批 D）— 补 `tests/parity/cli-args.test.ts` 的 `buildInput` 级断言：`kb.export --format xlsx` → `{kb_id:1, format:'xlsx'}`，与既有 `parseArgs` 透传断言共同闭合 D8。

### ⑤ AutoWiki / Agent / Harness

#### E1 `agent.run` 完全忽略 agent 配置（tools/model/instructions）— MEDIUM
- **文件位置**：`backend/services/agent.service.ts:149-173`。
- **复现条件**：任意 agent（不同 tools/model/instructions）跑出相同结果（固定 retrieve→synthesize 两步）。
- **影响范围**：A01 配置无实际作用，agent 能力表面化。
- **修复建议**：读取 agent 配置驱动工具选择与模型。
- **验证标准**：不同配置产生不同执行路径。
- **状态**：`open`（批 D 分析，未实施）— 详见 §5「Agent/Harness 设计与风险分析」：`run()` 仅用 `agent.id`，`agent.tools/model/instructions` 均未驱动执行；`synthesize` 为确定性文本拼接（非 LLM），`agent.model` 自然失效。最小兼容修复方案已给出，未获确认不实施。

#### E2 `agent.mcpTest` 恒返回 `reachable:true` — MEDIUM
- **文件位置**：`backend/services/agent.service.ts:229-264`（`mcpTest`）。
- **复现条件**：对不可达 MCP server 调用 mcpTest 仍返回 reachable:true（假阳性）。
- **影响范围**：连通性检测无意义。
- **修复建议**：真实探测（超时握手）后返回。
- **验证标准**：不可达 server → reachable:false。
- **状态**：`verified`（批 C）— 重写 `mcpTest`：经 `McpHttpClient.initialize` 做真实连接 + 协议握手（可选 `tools/list` 枚举），成功返回 `protocol_version/server_info/tools_count`，失败返回 `reachable:false` + 类型化 `error.kind`；无 `url` 抛 `validation_failed`。回归 `tests/parity/agent-mcp.test.ts`（真实 loopback JSON-RPC stub + 失败/缺参路径）。

#### E3 `agent.mcpCall` 忽略 `server` 参数，本地执行内置工具 — MEDIUM
- **文件位置**：`backend/services/agent.service.ts:266-320`（`mcpCall`/`resolveServerRef`/`toServiceError`）。
- **复现条件**：mcpCall(server='remote', tool='x') 实际执行 BUILTIN_TOOLS 本地工具。
- **影响范围**：与契约不符，无法调用外部 MCP server。
- **修复建议**：按 server 参数路由到真实 MCP 客户端。
- **验证标准**：指定 server 时调用该 server。
- **状态**：`verified`（批 C）— `mcpCall` 区分本地 Builtin（无 `server`，返回 `remote:false`、`server:'builtin'`，仅允许内置工具）与远程 MCP（`server` 存在时经 `resolveServerRef` 取配置 → `McpHttpClient.callTool` 走真实 HTTP，返回 `remote:true`）；错误映射 `tool_not_found`→`resource_not_found`、`remote_error`→`internal`、非法 URL/SSRF→`validation_failed`；未配置的 server → `resource_not_found`。回归 `tests/parity/agent-mcp.test.ts`（真实 loopback stub 证明请求到达目标并返回目标结果 + dispatch/错误映射）。

#### E4 `agent.resume` 从零重跑 — LOW
- **文件位置**：`backend/services/agent.service.ts:355-359`。
- **复现条件**：resume 新建 run 并重放全部副作用。
- **影响范围**：续跑语义缺失。
- **修复建议**：基于持久化 run 状态续跑。
- **验证标准**：resume 不重复已完成的副作用。
- **状态**：`open`（批 D 分析，未实施）— 详见 §5：`resume()` 实为「同 goal 重跑」：新建 `run_${uuid}` 并重放 retrieve→synthesize 与新建 run 行；不读取既有 `steps/answer/trace`。最小兼容修复（对 `succeeded` 幂等返回、仅 `failed/running` 重跑）会改变该 op 现有契约，未获确认不实施。

#### E5 `sandboxStatus` 恒 `{available:true, mode:'in-process'}`，无隔离 — LOW
- **文件位置**：`backend/services/agent.service.ts:282-303`。
- **复现条件**：sandboxRun 仅 4 个确定性任务，无 Docker 隔离。
- **影响范围**：沙箱安全性未实现（已在 P6 记录为简化）。
- **修复建议**：接真实沙箱或明确降级文档。
- **验证标准**：隔离级别与文档一致。
- **状态**：`open`（批 D 分析，未实施）— 详见 §5：`sandboxStatus` 硬编码 `{available:true, mode:'in-process'}`；`sandboxRun` 仅 4 个确定性任务（`runSandboxTask` 白名单，无 spawn/无任意代码执行）。`mode:'in-process'` 命名诚实，但 `available:true` 与真实隔离语义有落差。最小兼容修复（补 `isolation:'none'` + `capabilities:['deterministic-tasks']` 明示无隔离）为加字段的非破坏性改动，未获确认不实施。

#### E6 `wiki.revert` 不恢复 `summary` — LOW
- **文件位置**：`backend/services/wiki.service.ts:320`。
- **复现条件**：revert 后 summary 保留当前值，与回滚后 content 不一致。
- **影响范围**：回滚后摘要与内容失配。
- **修复建议**：revert 同时恢复对应 revision 的 summary。
- **验证标准**：revert 后 summary 与 revision 一致。
- **状态**：`verified`（批 D，最小兼容）— `wiki_revisions` 表无 `summary` 列（仅 title/content/checksum），精确恢复原摘要需数据库迁移（按约束暂停）。最小兼容修复：`revert` 现用 `summaryOf(target.content)`（取 content 前 200 字，与 `synthMarkdown` 摘要约定一致）回写 `summary`，使回滚后 summary 与 content 一致，不再保留陈旧摘要。回归 `tests/parity/wiki.test.ts` revert 用例新增 `summary:'old content'` 断言。局限诚实记录：原摘要未被持久化，回滚摘要为「由 content 派生」，非「历史原值」。

### ⑥ 测试质量 / 证据

#### F1 `job.list`/`job.view` 无任何测试却被标 passed — HIGH
- **文件位置**：`docs/parity/operations/job.list.json`、`docs/parity/operations/job.view.json` 的 `testFile` 指向 `tests/parity/model.test.ts`，但该文件及 `scripts/smoke-model.ts` 均不引用 list/view。
- **复现条件**：验收证据声称两 op 有正/负测试，实际不存在。
- **影响范围**：两 op 完全未验证，坏了也能过验收；影响验收证据可信度。
- **修复建议**：补齐真实正/负测试或修正证据映射。
- **验证标准**：`job.list`/`job.view` 有可执行的测试。
- **状态**：`verified`（批 B）— 新增 `tests/parity/job-e2e.test.ts`：真实 `createApp`（bootstrap 关）+ 真实 JWT + 真实内存 `importJobService`（空文件播种 → 快速失败、不写库）+ 真实 HTTP（401/200/404）+ 真实 CLI 进程（`job list`/`job view`/无 token）+ 真实 operation handler（MCP 代码路径）。

#### F2 `job.*` 命名空间指向两个后端 — HIGH
- **文件位置**：`job.list`/`job.view` 走内存 `importJobService`（`backend/services/import-job.service.ts:39` 的 `Map`），`server/routes/pipeline.ts:281,295,300`；`job.wait/cancel/retry/events/artifacts` 走持久 `parse_jobs` 队列。
- **复现条件**：进程重启后 `job.list`/`job.view` 丢失。
- **影响范围**：job 命名空间语义割裂、易失数据。
- **修复建议**：统一到持久 job 存储。
- **验证标准**：重启后 job 可见性一致。
- **状态**：`paused`（批 B，待确认）— 统一 Job 后端需数据库迁移/改变接口契约，按用户要求暂停改动并提交设计与风险说明（见 §4）。

#### F3 向量检索失败被吞并静默降级 — HIGH
- **文件位置**：`backend/services/search.service.ts:9-46`（`semanticSearch`）、`:147-182`（`contentSearch`）、`server/routes/pipeline.ts:262-271`（`/search`）。
- **复现条件**：pgvector 异常/embedding 空向量时，语义检索静默退化，关键词有命中仍绿。
- **影响范围**：向量库坏掉不报错，静默质量退化，测试误绿。
- **修复建议**：降级时在结果上显式标记 fallback/reason，或上抛。
- **验证标准**：向量失败时结果携带降级标记。
- **状态**：`verified`（批 C）— `semanticSearch` 区分「向量抛错/库不可用」与「向量空结果」：前者对每条结果打 `degraded:{reason,fallback}` 并 `console.warn`，后者（正常混合兜底）不标记；`contentSearch` 降级日志显式标注 `falling back to content keyword`；`pipeline /search` 路由把降级结果如实标注 `source=fallback` + `degraded:true` + `degradedReason`，不再冒充 `pgvector`。回归 `tests/parity/search-degradation.test.ts`（4 用例：embedding 失败/库不可用/空结果不误标/日志可观测）。

#### F4 单测大量 mock 仓库/LLM/检索，真实路径未被 `npm test` 覆盖 — MEDIUM
- **文件位置**：`tests/parity/knowledge-crud.test.ts:34-37`（99 处 mock）、`chat.test.ts:35`、`model/wiki/datasource/parse-job/agent` 等。
- **复现条件**：真实 SQL 约束/join/LLM/向量路径不在 `npm test` 覆盖内。
- **影响范围**：集成缺陷无法被单测捕获。
- **修复建议**：补充真实 DB/服务的集成测试。
- **验证标准**：关键路径有非 mock 集成覆盖。
- **状态**：`partial`（批 B）— 关键路径已补真实集成：job.list/view（真实 HTTP+CLI+MCP）、Provider Probe（真实 stub）、parse-job worker 生命周期（真实隔离 DB）。其余知识/聊天真实 DB 路径延后。

#### F5 worker 侧 op 无 smoke 覆盖 — MEDIUM
- **文件位置**：parse-job / elements / chunk-preview-edit / ingest 仅 mock 单测，无 `scripts/smoke-*`。
- **复现条件**：这些 op 的真实 HTTP/worker 路径无 E2E。
- **影响范围**：worker 侧回归不可见。
- **修复建议**：补齐对应 smoke。
- **验证标准**：worker op 有 smoke。
- **状态**：`partial`（批 B）— parse-job 已补真实隔离 DB 生命周期测试（`tests/parity/parse-job-db.test.ts`：enqueue/lease/heartbeat/checkpoint/complete/fail/deadletter/replay）；chunk（`tests/services/chunk.service.test.ts`）与 elements 抽取器（`tests/parity/elements.test.ts`）已有真实纯函数测试；ingest 全链路 DB+embed 测试延后（需 KB/document/elements/chunks/vectors/revisions 多表 + pgvector 维度 + stub embedder，风险面较大，记录待批 C/D）。

#### F6 `model.test` provider probe 未走通正路径 — MEDIUM
- **文件位置**：`tests/parity/model.test.ts:139-147`（只断言不抛错+字段类型，`reachable:false` 也能过）、`rerank_test` 只有负例、M01 无 view 正例。
- **复现条件**：provider 永不可达也能通过测试。
- **影响范围**：模型探测测试形同虚设。
- **修复建议**：补充 reachable:true 正路径断言。
- **验证标准**：正/负两路均断言。
- **状态**：`verified`（批 B）— 新增 `tests/parity/model-probe.test.ts`（真实 loopback stub 驱动 `modelService.test` 的 llm/embedding 正负两路：`reachable:true` 与 `reachable:false` 均断言）+ `tests/parity/model.test.ts` 补 M01 view 正例。

#### F7 两个 smoke 用进程内服务调用造数，绕过 REST — MEDIUM
- **文件位置**：`scripts/smoke-eval.ts:2-3`、`scripts/smoke-knowledge.ts:12`（直接 import service 造数）。
- **复现条件**：文档创建未走真实 HTTP 信封/鉴权/路由。
- **影响范围**：REST 层回归不可见。
- **修复建议**：改为经 HTTP 客户端造数。
- **验证标准**：smoke 走 REST。
- **状态**：`documented`（批 B）— 已核查：`scripts/smoke-eval.ts:9-10`（`parseApiService`+`ingestService`）与 `scripts/smoke-knowledge.ts:11,92`（`knowledgeService.createDocumentWithRevision`）仅**造数（seed）**走进程内 service；被验证的 op（登录/kb/folder/doc/eval 等）仍走真实 HTTP。原因是内容型文档创建无公开 REST 路由（仅 `doc.upload` 文件上传），属 setup 而非被测路径；如需完全 HTTP 造数可改用 `doc.upload`，记录待批 C/D。

#### F8 `parse-job` checkpoint 只断言 `toBeTruthy` — LOW
- **文件位置**：`tests/parity/parse-job.test.ts:111`。
- **复现条件**：checkpoint 字段类型/内容错误仍通过。
- **影响范围**：弱断言。
- **修复建议**：断言具体字段。
- **验证标准**：字段级断言。
- **状态**：`verified`（批 D）— `tests/parity/parse-job.test.ts:111` 由 `toBeTruthy()` 改为 `toEqual(expect.objectContaining({ job_id:'parse_x', status:'running' }))`（对应 `toStatusView` 的 `job_id`/`status` 字段）。

#### F9 `PUT /entries/:id` 把任何错误都报 404 — LOW
- **文件位置**：`server/routes/entries.ts:57-71`。
- **复现条件**：DB 异常/校验错误被误报为资源不存在。
- **影响范围**：错误语义失真。
- **修复建议**：区分 not-found 与内部错误。
- **验证标准**：DB 异常 → 5xx。
- **状态**：`verified`（批 C）— `update` 返回 `undefined`（无匹配行）→ 404 `ENTRY_NOT_FOUND`；抛错（DB/校验）→ 500 `UPDATE_FAILED`，不再被误报 404。回归 `tests/parity/entries-route.test.ts`（真实 `createApp`+JWT，404/200/500/401 四路）。

#### F10 rerank 失败静默 fallback — LOW
- **文件位置**：`backend/services/rerank.service.ts:22-31`（`RerankResult.reason?`）、`:108-143`。
- **复现条件**：rerank provider 失败静默回退原始排序，结果携带 `fallback:true` 但日志弱。
- **影响范围**：重排失效不可见（结果已带 fallback 标记，影响较小）。
- **修复建议**：保留标记，补充告警日志。
- **验证标准**：fallback 可观测。
- **状态**：`verified`（批 C）— `RerankResult` 增加 `reason?`，fallback 时写入 provider 失败原因并 `console.warn`（区分超时），成功路径省略；`model.rerank_test` 透传 `reason`。回归 `tests/parity/error-visibility.test.ts`。

#### F11 provider probe / 流式 catch 吞错 — LOW
- **文件位置**：`backend/services/model.service.ts:90-127`（`test`）、`backend/services/ai.service.ts:249-262`（`streamChat`）。
- **复现条件**：探测/流式错误被 catch 吞掉。
- **影响范围**：结构化结果已含 reachable:false，影响较小。
- **修复建议**：保留结构化结果，补充日志。
- **验证标准**：失败可观测。
- **状态**：`verified`（批 C）— `model.test` 失败时返回可观测 `error` 字段（成功省略）并 `console.warn`；`ai.streamChat` 中断时 `console.warn`（原有 error 事件保留）；`model.rerank_test` 透传 `reason`。回归 `tests/parity/error-visibility.test.ts`。

#### F12 若干 pass-through/cursor 弱断言 — LOW
- **文件位置**：`tests/parity/model.test.ts:80-82`、`datasource.test.ts:104`、`meta.test.ts:14,29-30`。
- **复现条件**：透传值未断言具体内容。
- **影响范围**：弱断言。
- **修复建议**：补充字段级断言。
- **验证标准**：字段级断言。
- **状态**：`verified`（批 D）— `model.test.ts` list 断言补 `items` 长度 + `toMatchObject({id,name,kind})`；`datasource.test.ts:104` cursor 由 `toBeTruthy()` 改为断言 string 非空 + 与 `updateDatasource` 持久化值一致；`meta.test.ts:14` 补 `http` 绑定断言、`:29-30` 由 `toBeDefined()` 改为断言 `inputSchema/outputSchema.type==='object'` + properties 非空。

#### F13 `ParseJobService.complete()` 用 snake_case `finished_at`，Drizzle 静默丢弃 — MEDIUM（批 B 新发现并已修复）
- **文件位置**：`backend/services/parse-job.service.ts:158`（`finished_at: new Date()`，应为 `finishedAt`）。
- **复现条件**：`parseJobService.complete()` 后 job 状态为 `succeeded`，但 `finished_at` 恒为 `NULL`；`job.events` 的时间线推导依赖 `finished_at`，会缺失「succeeded」事件的时间戳。仅 mock 单测无法暴露（仓库被 mock），由批 B 新增的真实隔离 DB 测试 `tests/parity/parse-job-db.test.ts` 断言 `finished_at` 非空时暴露。
- **影响范围**：worker 完成时间戳丢失，事件时间线不完整。
- **修复建议**：`finished_at` → `finishedAt`（与 `JobUpdate` 类型对齐；`cancel`/`fail` 已用 `finishedAt`，仅 `complete` 笔误）。
- **验证标准**：真实 DB 测试断言 `complete` 后 `finished_at` 非空。
- **状态**：`verified`（批 B）— 已修复，`tests/parity/parse-job-db.test.ts` 3 用例通过。

---

## 3. 修复状态跟踪

| 批次 | 范围 | 缺陷 | 状态 |
|---|---|---|---|
| 批 A | CLI/MCP 参数处理 | A1, D1, D2, D3, D4, D5, D6, D8 | ✅ 已完成（A1/D1–D6 `verified`，D8 部分） |
| 批 B | job 语义 + 测试入口 | B1, C1, F1, F2, F4, F5, F6, F7 | ✅ 已完成（B1/C1/F1/F6 `verified`；F4/F5 `partial`；F7 `documented`；F2 `paused` 待确认 §4） |
| 批 B（新发现） | worker 完成时间戳 | F13 | ✅ 已修复 `verified`（`finished_at`→`finishedAt`） |
| 批 C | MCP 真实性 + 降级/错误可见性 | E2, E3, F3, F9, F10, F11 | ✅ 已完成（全部 `verified`；另增 MCP SSRF 防护） |
| 批 D | 低优先 | D7, D8, E6, F8, F12 | ✅ 已完成（全部 `verified`，最小兼容修复） |
| 批 D（分析→实施） | Agent/Harness | E1, E4, E5 | ✅ 已完成（最小兼容修复，见 §5） |

---

## 4. F2 统一 Job 后端 — 设计与风险说明（暂停，待确认）

批 B 对 `job.*` 命名空间两个后端的审计结论（只读核查，未改代码）：

- **现状**：`job.list`/`job.view` 走内存 `importJobService`（`backend/services/import-job.service.ts` 的 `Map`，id `imp-*`，status `pending/running/success/failed/cancelled`），经 `GET /api/pipeline/jobs[/:id]`；`job.wait/cancel/retry/events/artifacts` 走持久 `parse_jobs`/`parse_deadletters` 队列（id `parse_*`，status `pending/running/succeeded/failed/cancelled`），经 `/api/v2/ops/job/*`。
- **数据模型不兼容**：id 前缀（`imp-` vs `parse-`）、status 枚举（`success` vs `succeeded`）、字段形状（`importJobService` 的 `stages/result/entryId` vs `parse_jobs` 的 `stage/progress/checkpoint/lease_*`）均不同。
- **数据/API 兼容风险**：`parse_jobs` 为 `0012_add_parse_jobs.sql` 新增的附加表（无既有业务数据，无破坏性迁移）；但「统一」意味着把 `job.list/view` 改挂到持久队列并统一 status/字段，会**改变现有接口契约**（`/api/pipeline/jobs` 的返回形状与 `job.list/view` 的 outputSchema），并涉及前端 `UploadManager` 轮询 `/jobs/:id` 的兼容。
- **暂停原因**：按用户要求「如果统一 Job 后端需要数据库迁移、改变现有接口契约或可能影响已有业务数据，先提交设计与风险说明，暂停相关改动，等待确认」。
- **建议方案（待确认后实施）**：引入「读时适配层」将两种 job 视图归一到一个稳定 DTO（不改 `parse_jobs` 表结构、不迁移既有数据），或分阶段：先加持久 import-job 存储（新增表，不动旧表）再切换读路径。**未获确认前不实施任何改动。**

---

## 5. Agent / Harness 设计与风险分析（E1/E4/E5 已于 2026-10-12 实施最小兼容修复）

按用户要求，E1/E4/E5 三项 Agent 相关缺陷先做设计与风险分析（下文），2026-10-12 已获授权实施最小兼容修复（无数据库迁移、无新 Agent 框架、不接入真实 LLM 合成 / Docker 沙箱）。实施内容见本节末尾「实施记录」。

### E1 — `agent.run` 完全忽略 agent 配置（tools/model/instructions）— MEDIUM

- **现状（已核查 `backend/services/agent.service.ts`）**：`run()`（:152-177）调用 `this.view(agent_id)` 校验 agent 存在后，仅使用 `agent.id`；`agent.tools`、`agent.model`、`agent.instructions` 均未驱动执行。执行路径固定两步：`retrieve`（`retrievalService.filteredSearch`，`method`/`top_k` 取自 input 而非 agent 配置）→ `synthesize`（`synthesize()` :52，确定性文本拼接，非 LLM 调用）。
- **风险**：A01 能力表面化——不同 agent 配置产出相同执行路径；`agent.model` 因无 LLM 调用而天然失效。**不伪造结果**：answer 源自真实检索命中；不影响 162 op / 51 能力验收计数。
- **最小兼容修复（待确认后实施，无破坏性）**：① 将 `agent.instructions` 注入 `synthesize` 作为前缀/上下文（廉价、不改签名）；② 以 `agent.tools` 作为 retrieve 方法可用集的门控（若未含 `retrieve` 则拒绝或回退）。③ `agent.model` 驱动的真实 LLM 合成**属于较大改动**——会使 `agent.run` 依赖 Ollama 可用性、改变输出确定性、破坏既有 mock 测试，本轮不纳入，记为文档化差距。
- **风险说明**：接入真实 LLM 合成需新增 LLM 依赖注入 + 失败降级（避免 `agent.run` 因模型不可用而整体失败），并同步更新 `tests/parity/agent.test.ts`。未获确认前不实施。

### E4 — `agent.resume` 从零重跑 — LOW

- **现状（已核查）**：`resume()`（:429-433）取到 run 后调用 `this.run({agent_id, goal})`，**新建** `run_${uuid}` 并重放 retrieve→synthesize，不读取既有 run 的 `steps/answer/trace`。
- **风险**：语义上是「同 goal 重跑」而非「续跑」；副作用被重复（新 run 行 + 重新检索）。**无数据损坏**（仅新增 run 行，幂等性尚可），但语义误导、浪费工作。
- **最小兼容修复（待确认后实施，改变 op 契约）**：`resume` 对 `status==='succeeded'` 的 run 幂等返回既有结果；仅对 `failed`/`running` 重跑。**注意**：此改动改变 `resume` 对已成功 run 的现有契约（当前会新建 run），属公开行为变化，需确认。
- **风险说明**：若引入「基于持久化 run 状态续跑」，需在 `agent_runs` 表加断点/步骤索引字段（数据库迁移）或复用现有 `steps` 数组推算，前者触发迁移暂停条件。本轮不实施。

### E5 — `sandboxStatus` 恒 `{available:true, mode:'in-process'}`，无隔离 — LOW

- **现状（已核查）**：`sandboxStatus()`（:356-358）硬编码 `{available:true, mode:'in-process', description, checked_at}`；`sandboxRun()`（:360-378）执行 `runSandboxTask()`（:91）固定 4 个确定性任务白名单，**无 spawn/无任意代码执行**。
- **风险**：无任意命令执行风险（白名单 + 无 spawn）；`mode:'in-process'` 命名诚实。唯一落差：`available:true` 与「真实沙箱隔离」语义不符，调用方可能误判隔离等级。
- **最小兼容修复（待确认后实施，加字段非破坏性）**：`sandboxStatus` 增补 `isolation:'none'` 与 `capabilities:['deterministic-tasks']`（或对 `available` 保持 `true` 但明确 `isolated:false`），让调用方无法把 in-process 白名单误读为容器/进程隔离。接真实 Docker 沙箱属较大架构改动，不在本批范围。

### 实施记录（2026-10-12，最小兼容修复，未迁移 / 未 push）

落地文件：`backend/services/agent.service.ts`、`packages/operation-registry/src/operations.ts`、`tests/parity/agent.test.ts`。

**E1 — agent 配置生效**
- `resolveAllowedTools(agent)`：`agent.tools` 空数组 → 全部内置工具（兼容默认）；非空 → 仅白名单；未知工具名抛 `validation_failed`（不静默过滤）。仅约束**本地内置工具**，不扩展到远程 MCP（远程由 `mcp_servers` 单独治理）。
- `run()` / `toolCall()` / `mcpCall()`（本地分支）统一走 `resolveAllowedTools` 白名单校验；`run()` 若白名单不含 `retrieve` 则 `validation_failed`。
- `agent.model` 非空 → 返回 `capability_limits`，声明「模型已配置但未实现模型驱动合成，实际用确定性检索合成」，不宣称指定模型已执行。
- `agent.instructions` 注入 `synthesize` 作为上下文前缀，并记录 `capability_limits`「确定性合成器无法保证指令被真正遵循（无 LLM 推理）」。
- 未在日志/trace/错误中输出 API Key/Token（`resolveServerRef` 返回 `ref`，不落日志）。

**E4 — resume Option A（只读已完成结果，不 checkpoint 续跑）**
- `status==='succeeded'` → 直接返回既有 `run_id` + `answer`/`steps`/`trace`，**不新建 run、不重跑 retrieve/synthesize**。
- `failed`/`cancelled`/`running`/状态不明确 → 抛 `conflict` 类型化错误并说明原因。
- 未新增数据库字段、未实施 checkpoint 状态机。registry 描述明确「只读已完成结果、不支持 checkpoint 续跑」。
- `agent.resume` 元数据由 `kind:mutation / risk:write / readOnlyHint:false / scopes:agent:write` 改为 `kind:query / risk:read / readOnlyHint:true / scopes:agent:read`（如实反映只读语义）。

**E5 — sandbox 能力真实性**
- `sandboxStatus()` 增补 `isolated:false`、`isolation:'none'`、`capabilities:['echo','count_tokens','checksum','sum']`，保留 `available/mode/description/checked_at` 兼容旧调用方。
- `sandboxRun()` 仍仅执行 `runSandboxTask` 四个确定性白名单任务，无 spawn、无任意命令执行。

**回归测试（`tests/parity/agent.test.ts` 新增 13 用例）**：工具白名单允许/拒绝/未知工具三类；`model`/`instructions` 能力限制声明；`succeeded` resume 不产生新 DB 记录（`createRun`/`updateRun` 未调用）；`failed`/`cancelled`/`running` 拒绝续跑（`conflict`）；`sandboxStatus` 状态真实。

**验证结果**：`npm test` 45 文件 474 用例、`npm run test:e2e` 19 用例、`npm run lint`（tsc --noEmit）、`npm run typecheck:backend` 全部通过。162 个必需 CLI/MCP 操作数量与绑定不变（live registry 163 注册，其中 162 为必需；本批未新增/删除/重命名操作）。历史验收证据仍快照于 `67d76a6`，最终 G5 验收（重生成证据 + 重跑 `evaluate_delivery.py`）已按用户要求暂停，本批不执行。

