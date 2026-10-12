# MicroEra Wiki — 缺陷审计报告（基线）

> 审计时间：2026-10-12 ｜ 方式：只读代码核查 + 实测定向，未改业务代码
> 基线 HEAD：`67d76a6`（本地 main）
> 报告定位：本文件为「开发质量提升阶段」的缺陷基线，逐项记录严重程度、文件位置、复现条件、影响范围、修复建议与验证标准，并跟踪分批修复状态。

## 0. 历史验收结论状态标注

上一阶段（P0–P10 收尾）的权威验收器 `evaluate_delivery.py` 判定为：

- `accepted_points = 86/100`，`verified_operations = 162/162`，`operation_parity = true`，`ok = true`。

**自本轮缺陷排查起，上述结论标注为「待重新验证」**，不再作为已完全验证的最终交付结论使用。原因是本轮确认存在以下尚未修复、且会影响验收证据可信度的缺陷（详见 §2 的 HIGH 项）：`job.list`/`job.view` 无任何真实测试却被标 passed（F1）、`job.*` 命名空间指向两个后端（F2）、向量检索失败被静默降级（F3）、CLI 多个操作参数映射错误导致按文档用法无法执行（A1/D1/D2/D3）。

在批 A（及后续批 B/C/D）修复并回归后，需重新生成验收证据并重跑权威校验器，方能恢复「已完全验证」的终态判定。

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
- **状态**：`open`

### ② datasource.sync 幂等断言

#### B1 smoke 断言 `created === 3` 依赖干净库 — MEDIUM
- **文件位置**：`scripts/smoke-datasource.ts:75`。
- **复现条件**：共享 dev 库已有既往导入（本地 connector 3 份样例文档已存在）时，`npx tsx scripts/smoke-datasource.ts` 第 18 步 `datasource.sync imports 3 docs` 恒失败。实测 `total=3, created=0, skipped=3, failed=0`。
- **影响范围**：仅 smoke 测试断言错误；同步/去重/cursor 增量逻辑本身正常（非功能缺陷）。
- **修复建议**：断言改为幂等（接受 `created + skipped === 3`）或在隔离库上运行。
- **验证标准**：`smoke-datasource` 在已导入与干净库两种状态均通过。
- **状态**：`open`（批 B）

### ③ test:e2e 入口缺失

#### C1 无统一 `npm run test:e2e` 入口 — MEDIUM
- **文件位置**：`package.json`（仅有 `test`/`test:coverage`/`smoke*`，无 `test:e2e`）。
- **复现条件**：`npm run test:e2e` 报 unknown script。
- **影响范围**：规划 G5 门禁第 5 条要求新增统一 E2E 入口；当前靠手工逐个 `tsx scripts/smoke-*.ts`。
- **修复建议**：新增 `test:e2e` 脚本聚合各 smoke。
- **验证标准**：`npm run test:e2e` 一键执行并汇总通过/失败。
- **状态**：`open`（批 B）

### ④ API/CLI/MCP 功能与行为一致性

#### D1 `chat.references` 无法传必填 `message_id` — HIGH
- **文件位置**：`cli/src/main.ts:98`（`buildInput` 返回 `{conversation_id}`，键名错误且忽略 `--message-id`）；schema `packages/operation-registry/src/operations.ts:1388`（required `message_id`）；`server/routes/chat-v2.ts:73-75` 读 `message_id`。
- **复现条件**：`tsx cli/src/main.ts chat references --message-id msg_...` 后端收到空 body，操作恒失败/空。
- **影响范围**：该 CLI 操作完全不可用（REST/MCP 正常）。
- **修复建议**：`--message-id` → `message_id`，删掉手写特判，交给通用 schema 映射。
- **验证标准**：真实 CLI 调用经 mock server 捕获 body 含 `message_id`。
- **状态**：`open`（批 A）

#### D2 9 个读/搜操作位置参数被静默丢弃 — HIGH
- **文件位置**：`cli/src/main.ts:118-133`（通用分支只映射 flags，不消费位置参数）。
- **复现条件**：`search.vector/lexical/explain/filtered`、`chat.stream`、`session.ask`、`message.search`、`wiki.search`、`graph.search` 按 registry 示例用位置参数传 query（如 `microera search vector "MOF"`），后端收到空 query。
- **影响范围**：9 个文档化 CLI 命令按示例用法失败。
- **修复建议**：通用分支把首个位置参数映射到「首个 required 字符串字段」（query/question/q）。
- **验证标准**：真实 CLI 调用经 mock server 捕获 body 含 `query`/`question`/`q`。
- **状态**：`open`（批 A）

#### D3 `chat.ask` 丢 `kb_ids/session_id/top_k/method/is_internal`，且 `session_id` 错映射为 `conversation_id` — HIGH
- **文件位置**：`cli/src/main.ts:97` vs schema `operations.ts:1351-1361`、`server/routes/chat-v2.ts:62-68`。
- **复现条件**：`microera chat ask "..." --kb-ids 1 --method hybrid --session-id sess_...` 时范围过滤静默失效、session 关联丢失。
- **影响范围**：检索范围/会话上下文被静默丢弃，返回错误结果而非报错。
- **修复建议**：删掉手写特判，交给通用 schema 映射（含 `kb_ids` 数组解析）。
- **验证标准**：mock server 捕获 body 含 `kb_ids:[1]`、`method:'hybrid'`、`session_id`。
- **状态**：`open`（批 A）

#### D4 `search.hybrid` 丢 `kb_id/folder_id/is_internal/rrf_k` — MEDIUM
- **文件位置**：`cli/src/main.ts:96`（只保留 `{query, top_k}`）；schema `operations.ts:977-987`。
- **复现条件**：`microera search hybrid "MOF" --kb-id 1 --rrf-k 60` 时过滤与 RRF 参数丢失。
- **影响范围**：过滤静默失效。
- **修复建议**：删掉手写特判，交给通用 schema 映射。
- **验证标准**：mock server 捕获 body 含 `kb_id`、`rrf_k`。
- **状态**：`open`（批 A）

#### D5 数组 flag 强制 `Number` 转换破坏 JSON/空格/非数值数组 — MEDIUM
- **文件位置**：`cli/src/main.ts:128`（`split(',').map(Number).filter(Number.isFinite)`）。
- **复现条件**：`search.rerank --documents '[{"text":"a"}]'` → `[]`；`--kb-ids "1 2"` → `[1]`；`eval.compare --run-ids eval_1 eval_2` → `[]`。
- **影响范围**：对象数组、空格分隔数组、字符串数组全部被破坏。
- **修复建议**：按 `items.type` 分派：object/array → JSON.parse；integer/number → 逗号+空白拆分后 Number；string → 保留字符串；boolean → 布尔。
- **验证标准**：单测覆盖 JSON 数组/数字数组/字符串数组/含空格参数四类。
- **状态**：`open`（批 A）

#### D6 datasource `projectId/dryRun` 用 camelCase 且 `--dry-run` 被全局吞 — LOW
- **文件位置**：`cli/src/main.ts:39`（全局 `--dry-run`）、`operations.ts:2652,2672`（`projectId`/`dryRun`）、`backend/services/datasource.service.ts:16,83`。
- **复现条件**：`microera datasource sync --datasource-id 1 --dry-run` 的 `--dry-run` 被全局消费，未落到 `input.dryRun`；`--project-id` 无映射。
- **影响范围**：datasource 预览/同步的过滤与 dry-run 语义在 CLI 不可达。
- **修复建议**：通用映射支持 kebab→camelCase；`--dry-run` 在 schema 含 `dryRun` 字段时同步写入 input。
- **验证标准**：mock server 捕获 body 含 `projectId`/`dryRun`。
- **状态**：`open`（批 A）

#### D7 `eval.run` 元数据 `risk:'read'` 但实际写库 — LOW
- **文件位置**：`operations.ts:1278` vs `backend/services/eval.service.ts:159`（`createRun`）。
- **复现条件**：`eval.run` 创建持久 eval 记录但风险元数据标 read（`readOnlyHint` 已正确为 false）。
- **影响范围**：元数据自相矛盾，审计/权限脚本可能误判。
- **修复建议**：`risk` 改为 `write`。
- **验证标准**：`eval.run` 的 `risk` 与 `mcp.readOnlyHint` 一致。
- **状态**：`open`（批 D）

#### D8 全局 flag 与 op 输入字段命名冲突 — LOW
- **文件位置**：`cli/src/main.ts:37-39`（全局 `--format`/`--timeout`/`--dry-run`）、`operations.ts:572`（`kb.export.format`）、`operations.ts:2672`（`datasource.sync.dryRun`）。
- **复现条件**：`kb.export --format <值>` 的 `--format` 被当作全局输出格式而非导出格式。
- **影响范围**：`kb.export.format`（可选字段）经 CLI 不可达。
- **修复建议**：全局 `--format` 仅在取值为 `json|ndjson|text` 时视为全局，其余透传给 op；并记录其余冲突。
- **验证标准**：`kb.export --format xlsx` 时 body 含 `format:'xlsx'`。
- **状态**：`open`（批 A 部分处理，其余记录）

### ⑤ AutoWiki / Agent / Harness

#### E1 `agent.run` 完全忽略 agent 配置（tools/model/instructions）— MEDIUM
- **文件位置**：`backend/services/agent.service.ts:149-173`。
- **复现条件**：任意 agent（不同 tools/model/instructions）跑出相同结果（固定 retrieve→synthesize 两步）。
- **影响范围**：A01 配置无实际作用，agent 能力表面化。
- **修复建议**：读取 agent 配置驱动工具选择与模型。
- **验证标准**：不同配置产生不同执行路径。
- **状态**：`open`（批 C/D）

#### E2 `agent.mcpTest` 恒返回 `reachable:true` — MEDIUM
- **文件位置**：`backend/services/agent.service.ts:226-237`。
- **复现条件**：对不可达 MCP server 调用 mcpTest 仍返回 reachable:true（假阳性）。
- **影响范围**：连通性检测无意义。
- **修复建议**：真实探测（超时握手）后返回。
- **验证标准**：不可达 server → reachable:false。
- **状态**：`open`（批 C）

#### E3 `agent.mcpCall` 忽略 `server` 参数，本地执行内置工具 — MEDIUM
- **文件位置**：`backend/services/agent.service.ts:239-246`。
- **复现条件**：mcpCall(server='remote', tool='x') 实际执行 BUILTIN_TOOLS 本地工具。
- **影响范围**：与契约不符，无法调用外部 MCP server。
- **修复建议**：按 server 参数路由到真实 MCP 客户端。
- **验证标准**：指定 server 时调用该 server。
- **状态**：`open`（批 C）

#### E4 `agent.resume` 从零重跑 — LOW
- **文件位置**：`backend/services/agent.service.ts:355-359`。
- **复现条件**：resume 新建 run 并重放全部副作用。
- **影响范围**：续跑语义缺失。
- **修复建议**：基于持久化 run 状态续跑。
- **验证标准**：resume 不重复已完成的副作用。
- **状态**：`open`（批 C/D）

#### E5 `sandboxStatus` 恒 `{available:true, mode:'in-process'}`，无隔离 — LOW
- **文件位置**：`backend/services/agent.service.ts:282-303`。
- **复现条件**：sandboxRun 仅 4 个确定性任务，无 Docker 隔离。
- **影响范围**：沙箱安全性未实现（已在 P6 记录为简化）。
- **修复建议**：接真实沙箱或明确降级文档。
- **验证标准**：隔离级别与文档一致。
- **状态**：`open`（批 D）

#### E6 `wiki.revert` 不恢复 `summary` — LOW
- **文件位置**：`backend/services/wiki.service.ts:320`。
- **复现条件**：revert 后 summary 保留当前值，与回滚后 content 不一致。
- **影响范围**：回滚后摘要与内容失配。
- **修复建议**：revert 同时恢复对应 revision 的 summary。
- **验证标准**：revert 后 summary 与 revision 一致。
- **状态**：`open`（批 D）

### ⑥ 测试质量 / 证据

#### F1 `job.list`/`job.view` 无任何测试却被标 passed — HIGH
- **文件位置**：`docs/parity/operations/job.list.json`、`docs/parity/operations/job.view.json` 的 `testFile` 指向 `tests/parity/model.test.ts`，但该文件及 `scripts/smoke-model.ts` 均不引用 list/view。
- **复现条件**：验收证据声称两 op 有正/负测试，实际不存在。
- **影响范围**：两 op 完全未验证，坏了也能过验收；影响验收证据可信度。
- **修复建议**：补齐真实正/负测试或修正证据映射。
- **验证标准**：`job.list`/`job.view` 有可执行的测试。
- **状态**：`open`（批 B）

#### F2 `job.*` 命名空间指向两个后端 — HIGH
- **文件位置**：`job.list`/`job.view` 走内存 `importJobService`（`backend/services/import-job.service.ts:39` 的 `Map`），`server/routes/pipeline.ts:281,295,300`；`job.wait/cancel/retry/events/artifacts` 走持久 `parse_jobs` 队列。
- **复现条件**：进程重启后 `job.list`/`job.view` 丢失。
- **影响范围**：job 命名空间语义割裂、易失数据。
- **修复建议**：统一到持久 job 存储。
- **验证标准**：重启后 job 可见性一致。
- **状态**：`open`（批 B）

#### F3 向量检索失败被吞并静默降级 — HIGH
- **文件位置**：`backend/services/search.service.ts:25-27`、`:149-152`（`console.warn` 后降级关键词/entry-chunk，不上抛）。
- **复现条件**：pgvector 异常/embedding 空向量时，语义检索静默退化，关键词有命中仍绿。
- **影响范围**：向量库坏掉不报错，静默质量退化，测试误绿。
- **修复建议**：降级时在结果上显式标记 fallback/reason，或上抛。
- **验证标准**：向量失败时结果携带降级标记。
- **状态**：`open`（批 C）

#### F4 单测大量 mock 仓库/LLM/检索，真实路径未被 `npm test` 覆盖 — MEDIUM
- **文件位置**：`tests/parity/knowledge-crud.test.ts:34-37`（99 处 mock）、`chat.test.ts:35`、`model/wiki/datasource/parse-job/agent` 等。
- **复现条件**：真实 SQL 约束/join/LLM/向量路径不在 `npm test` 覆盖内。
- **影响范围**：集成缺陷无法被单测捕获。
- **修复建议**：补充真实 DB/服务的集成测试。
- **验证标准**：关键路径有非 mock 集成覆盖。
- **状态**：`open`（批 B）

#### F5 worker 侧 op 无 smoke 覆盖 — MEDIUM
- **文件位置**：parse-job / elements / chunk-preview-edit / ingest 仅 mock 单测，无 `scripts/smoke-*`。
- **复现条件**：这些 op 的真实 HTTP/worker 路径无 E2E。
- **影响范围**：worker 侧回归不可见。
- **修复建议**：补齐对应 smoke。
- **验证标准**：worker op 有 smoke。
- **状态**：`open`（批 B）

#### F6 `model.test` provider probe 未走通正路径 — MEDIUM
- **文件位置**：`tests/parity/model.test.ts:139-147`（只断言不抛错+字段类型，`reachable:false` 也能过）、`rerank_test` 只有负例、M01 无 view 正例。
- **复现条件**：provider 永不可达也能通过测试。
- **影响范围**：模型探测测试形同虚设。
- **修复建议**：补充 reachable:true 正路径断言。
- **验证标准**：正/负两路均断言。
- **状态**：`open`（批 B）

#### F7 两个 smoke 用进程内服务调用造数，绕过 REST — MEDIUM
- **文件位置**：`scripts/smoke-eval.ts:2-3`、`scripts/smoke-knowledge.ts:12`（直接 import service 造数）。
- **复现条件**：文档创建未走真实 HTTP 信封/鉴权/路由。
- **影响范围**：REST 层回归不可见。
- **修复建议**：改为经 HTTP 客户端造数。
- **验证标准**：smoke 走 REST。
- **状态**：`open`（批 B）

#### F8 `parse-job` checkpoint 只断言 `toBeTruthy` — LOW
- **文件位置**：`tests/parity/parse-job.test.ts:111`。
- **复现条件**：checkpoint 字段类型/内容错误仍通过。
- **影响范围**：弱断言。
- **修复建议**：断言具体字段。
- **验证标准**：字段级断言。
- **状态**：`open`（批 D）

#### F9 `PUT /entries/:id` 把任何错误都报 404 — LOW
- **文件位置**：`server/routes/entries.ts:60`（`catch { res.status(404).json('ENTRY_NOT_FOUND') }`）。
- **复现条件**：DB 异常/校验错误被误报为资源不存在。
- **影响范围**：错误语义失真。
- **修复建议**：区分 not-found 与内部错误。
- **验证标准**：DB 异常 → 5xx。
- **状态**：`open`（批 C/D）

#### F10 rerank 失败静默 fallback — LOW
- **文件位置**：`backend/services/rerank.service.ts:115-116`（`catch { fallback = true }`）。
- **复现条件**：rerank provider 失败静默回退原始排序，结果携带 `fallback:true` 但日志弱。
- **影响范围**：重排失效不可见（结果已带 fallback 标记，影响较小）。
- **修复建议**：保留标记，补充告警日志。
- **验证标准**：fallback 可观测。
- **状态**：`open`（批 C）

#### F11 provider probe / 流式 catch 吞错 — LOW
- **文件位置**：`backend/services/model.service.ts:111`、`backend/services/ai.service.ts:249`。
- **复现条件**：探测/流式错误被 catch 吞掉。
- **影响范围**：结构化结果已含 reachable:false，影响较小。
- **修复建议**：保留结构化结果，补充日志。
- **验证标准**：失败可观测。
- **状态**：`open`（批 C）

#### F12 若干 pass-through/cursor 弱断言 — LOW
- **文件位置**：`tests/parity/model.test.ts:80-82`、`datasource.test.ts:104`、`meta.test.ts:14,29-30`。
- **复现条件**：透传值未断言具体内容。
- **影响范围**：弱断言。
- **修复建议**：补充字段级断言。
- **验证标准**：字段级断言。
- **状态**：`open`（批 D）

---

## 3. 修复状态跟踪

| 批次 | 范围 | 缺陷 | 状态 |
|---|---|---|---|
| 批 A | CLI/MCP 参数处理 | A1, D1, D2, D3, D4, D5, D6, D8 | 待执行 |
| 批 B | job 语义 + 测试入口 | B1, C1, F1, F2, F4, F5, F6, F7 | 待执行 |
| 批 C | 诚实化/降级可见性 | E2, E3, F3, F9, F10, F11 | 待执行 |
| 批 D | 低优先 | D7, D8, E1, E4, E5, E6, F8, F12 | 待执行 |
