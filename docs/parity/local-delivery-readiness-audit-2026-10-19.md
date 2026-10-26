# MiqroEra Wiki — 本地代码交付与演示验收就绪性审计（只读）

- 日期：2026-10-19
- 性质：**只读审计**，未修改任何业务代码、配置或迁移，未 commit / push，未执行开发库 / NUC / 腾讯云迁移，未运行破坏性清理，未读取 `.env`、JWT、密码或敏感文档正文。
- 范围：Phase 0 / Phase 1 / Tier A / TB-1 / TB-2 / TB-3 开发侧验证已完成（58 文件 / 613 用例全绿），进入「本地代码交付与演示验收」准备阶段。

---

## 0. 结论速览

| 项 | 结论 |
| --- | --- |
| **A. 本地交付就绪性** | **NOT READY** |
| 阻碍交付的阻断项 | 3 项（见 §B）：HTTP MCP 入站无鉴权、Docling 图片未登记 `document_images`（P1-B 生产接线不完整）、Docling/Python 运行环境不可复现 |
| 可延期非阻断项 | 见 §C（GC 调度、极窄竞态、`db:migrate` 不建 pgvector 扩展、`import_url` SSRF、Node 版本未固定等） |
| 测试真实度 | 613 用例中真实 DB 为主；真实 Docling / 真实 BGE-M3 各仅少量 gated 用例，其余为确定性 mock（见 §7） |

**核心判断**：代码与测试本身已具备交付质量（无内存中未落地的高危缺陷，安全姿态整体良好），但**尚不能判定 READY**，原因不在功能缺失，而在三处「交付验收时会被现场暴露」的真实问题：

1. HTTP MCP 服务（`packages/mcp/src/http.ts`）裸 `http.createServer`，**入站无任何鉴权**且 `server.listen(port)` 绑定全部网卡（日志却写 "localhost"），外部可无凭证调用其代理的全部业务工具。
2. P1-B 图片授权链路「鉴权侧」已完整（`document_images` 表 + `registerImages` + `isImageAccessible` + `/api/images` 鉴权 + `Cache-Control: no-store`），但「生产侧」**未接线**：`docling.ts` 把 PDF/DOCX 内嵌图片写入 `DATA_DIR/images/<uuid>.<ext>` 后**没有调用 `registerImages`**，导致演示「上传 PDF → 查看内嵌图片」时图片全部 404。
3. Docling 运行环境不可复现：默认 `python` 为 3.15.0b3（beta），而 Docling 实际装在 `Python312\Scripts\docling.exe`；仓库**无 `requirements.txt`/`pyproject.toml`**，`start.ps1` 硬编码绝对路径 `C:\Users\CAIHUI\...\Python312`。

---

## 1. Git 工作区未提交修改分类

### 1.1 已跟踪修改（`M`，58 个文件，历史累积开发成果）

按职责分组（本轮未改动任何，均为此前已批准迭代的累积结果）：

| 组 | 代表文件 |
| --- | --- |
| 后端应用/配置 | `backend/app.ts`、`backend/config.ts`、`backend/main.ts`、`server/index.ts` |
| 数据访问/仓库 | `backend/repositories/knowledge.repository.ts`、`parse-job.repository.ts` |
| 服务层 | `agent.service.ts`（IDOR 修复）、`chat.service.ts`、`chunk.service.ts`、`element.service.ts`、`job.service.ts`、`knowledge.service.ts`、`mcp-client.ts`（SSRF 防护）、`parse-api.service.ts`、`parse-job.service.ts` |
| 解析器 | `backend/parser/docling.ts`、`backend/parser/models.ts` |
| 连接器 | `connectors/arxiv/client.ts`、`crossref/client.ts`、`local/index.ts` |
| DB | `backend/db/schema.ts` |
| 前端 | `src/components/ContentPaginator.tsx`、`ContentRenderer.tsx`、`src/pages/HomePage.tsx`、`PublicHomePage.tsx`、`index.html` |
| CLI/MCP/契约 | `cli/src/main.ts`、`packages/mcp/src/mcp-core.ts`、`packages/contracts/src/types.ts`、`packages/operation-registry/src/http-client.ts` |
| 服务器路由 | `server/routes/knowledge-v2.ts` |
| 测试 | `tests/parity/*.test.ts`（13 个，含 phase1/phase2/tb3/vector-e2e/document-images 等） |
| 脚本/文档 | `scripts/auto-deploy.*`、`scripts/nuc-auto-deploy-setup.sh`、`start.ps1`、`Dockerfile`、`README.md`、`docs/handover/*`、`CONTENT_PROGRESS.md`、`package.json`、swagger |

### 1.2 未跟踪新增（`??`，本轮/近期新代码）

| 类别 | 文件 |
| --- | --- |
| **数据库迁移** | `backend/db/migrations/0019_add_document_images.sql`、`0020_add_parse_job_lease_version.sql`、`0021_add_document_current_parse_job.sql` |
| **仓库/服务/存储** | `backend/repositories/document-image.repository.ts`、`parse-commit.repository.ts`；`backend/storage/source-file-gc.ts`、`temp-file-gc.ts` |
| **图片路由/独立 Worker** | `server/routes/images.ts`、`server/worker.ts` |
| **MCP** | `packages/mcp/src/http.ts`、`stdio.ts`；`backend/services/mcp-url-guard.ts` |
| **前端组件** | 图片鉴权/受保护图片组件 |
| **测试 + 夹具** | 约 15 个新测试文件、真实夹具 `real-pdf.pdf` / `real-docx.docx`、`tests/helpers/apply-migrations.ts`、`assert-test-db.ts` |
| **历史归档（非代码）** | `docs/parity/history/67d76a6-2026-10-12/`（evidence/schemas/operations JSON，历史审计产物）、`docs/parity/*.md` 交付报告、`wiki-audit/` |

### 1.3 敏感文件排查结论

- `.env` **存在但已被 `.gitignore` 忽略**（`backend/data/…` 与 `.env*` 均在忽略清单），未提交、审计中也**未读取**其内容。
- `.env.example` 仅占位符（`JWT_SECRET`、`ADMIN_PASSWORD`、`DATABASE_URL`、`DATA_DIR`、`OLLAMA_URL`、`DEEPSEEK_API_KEY`、`FEISHU`、`MINIO`、`SANDBOX_DB`），无真实密钥。
- 全仓库唯一 `.pem` 为 `.venv/.../certifi/cacert.pem`（公共 CA 证书包，非私钥）。
- 未发现提交进版本库的 JWT 默认值之外的敏感常量（`DEFAULT_JWT_SECRET`/`DEFAULT_ADMIN_PASSWORD` 为 `config.ts` 中的开发默认值，`validateProductionSecrets()` 在 `NODE_ENV=production` 下硬失败保护）。

---

## 2. 本地启动要求核查

### 2.1 已就绪（实测）

| 依赖 | 实测结果 |
| --- | --- |
| Node.js | `v22.14.0` ✅ |
| npm | `10.9.2` ✅ |
| Ollama | 端口 `11434` LISTENING ✅（模型 `bge-m3`/`qwen2.5:7b` 由测试 `ollamaReady` 探针判定，需现场确认已 `ollama pull`） |
| PostgreSQL/pgvector | 端口 `5433` LISTENING ✅（测试库 `microera_wiki_test`） |
| Docling | 存在于 `Python312\Scripts\docling.exe` ✅（但见 §2.2 复现性风险） |

### 2.2 风险点（交付前必须厘清）

| # | 风险 | 详情 | 影响 |
| --- | --- | --- | --- |
| 1 | **数据库端口不一致** | `config.ts` 默认 `DATABASE_URL=...@localhost:5432/microera_wiki`，README §522 同为 5432；实测 5432 **closed**、5433 LISTENING | 演示机若不设 `.env`，server 连不上默认库；`.env` 必须显式 `DATABASE_URL` 指向实际实例（dev 为 5433） |
| 2 | **默认 python 是 3.15.0b3** | `python --version` = `Python 3.15.0b3`；Docling 实际在 Python312 | `resolveDoclingCommand()` 先试 `docling --version`（依赖 `docling.exe` 在 PATH），失败则回退 `python -c "from docling.cli import main"`（会用 3.15b3，大概率无 docling）→ 解析可能静默不可用 |
| 3 | **无依赖清单** | 仓库根**无 `requirements.txt`/`pyproject.toml`**，Docling 版本未固定；`start.ps1` 硬编码 `C:\Users\CAIHUI\...\Python312` + `docling.exe` | 换机/CI 无法复现 Docling 环境 |
| 4 | **Node 版本未固定** | `package.json` 无 `engines`；Dockerfile 用 `node:22-alpine`，`@types/node ^22` | 环境漂移风险（低） |
| 5 | **`db:migrate` 不建 pgvector 扩展** | `backend/db/migrate.ts` 走 drizzle migrator，**不执行 `CREATE EXTENSION vector`**；仅 `backend/app.ts` `runMigrations()` 会建扩展 | 若用 `npm run db:migrate` 单独建库，`knowledge_vectors.embedding vector(1024)` 迁移会失败；**建议演示走 `npm run server:dev` 自动 bootstrap**（含建扩展 + 迁移 + seed + admin） |

---

## 3. 本地启动顺序与演示脚本（实际操作 + 预期结果）

> 关键：**优先依赖 `npm run server:dev` 的自动 bootstrap**（`validateProductionSecrets` → `runMigrations`(建 vector 扩展 + 应用 0019/0020/0021) → `seedDatabase` → `seedAdmin` → Ollama warmup），避免手工 `db:migrate` 漏建扩展。

1. **PostgreSQL + pgvector**：确认 5433（或 `.env` 指向的实例）已装 `vector` 扩展。预期：`SELECT 1` 可连，`CREATE EXTENSION IF NOT EXISTS vector` 成功。
2. **Ollama**：`ollama serve`（端口 11434）+ `ollama pull bge-m3`（1024d）+ `ollama pull qwen2.5:7b`（对话）。预期：`curl localhost:11434/api/tags` 含两个模型。
3. **Docling**：确认 `docling --version` 可执行（PATH 含 `Python312\Scripts`），或设 `DOCLING_CMD`。预期：输出版本号。
4. **环境变量**：准备 `.env`（至少 `DATABASE_URL`、`DATA_DIR`、`OLLAMA_URL`、`JWT_SECRET`、`ADMIN_PASSWORD`）。预期：`validateProductionSecrets` 不报错（非 prod 可先用默认值）。
5. **启动 API**：`npm run server:dev`（Express :3001，自动 migrate + seed + admin + Ollama warmup）。预期：日志显示迁移 0019/0020/0021 应用、admin 种子、warmup 完成。
6. **启动 Worker**：`npm run worker`（`server/worker.ts` 独立进程，优雅停机）。预期：轮询 `parse_jobs`，`concurrency=2`。
7. **启动前端**：`npm run dev`（Vite :3000）。预期：浏览器打开登录页，admin/admin123（开发默认）登录。
8. **CLI 演示**：`npx tsx cli/src/main.ts doctor`（预期调 `/api/pipeline/health` 返回 ok）、`schema`（预期打印操作清单）、KB 创建 → 文档上传 → parse → search。
9. **MCP 演示**：`npm run mcp:stdio`（stdio，本地无需鉴权，预期 JSON-RPC `tools/list` 返回全部工具）；HTTP 侧见 §6 阻断项——**交付前不建议对外演示**。

---

## 4. CLI / MCP 实际可用状态核查

| 类别 | 状态 |
| --- | --- |
| **工具可发现** | ✅ `operationRegistry` 是唯一业务真源，`tools/list`/`resources/list`/`prompts/list` 均从 registry 派生；`mcp:stdio`/`mcp:http` 均可用 |
| **真实调用通过** | ✅ stdio 直连 `resolveBaseUrl()`（`MICROERA_HOST`/`MICROERA_API_URL`/`http://localhost:3001`）+ `resolveToken()`（`MICROERA_TOKEN`），工具透传真实 API |
| **CLI 已验收操作** | `version`、`schema`、`doctor`（真实 `/api/pipeline/health`）、KB/文档 CRUD、解析、检索 |
| **未验收/占位** | 部分 operation 无 `def.handler` → CLI `not_implemented`（`EXIT.NOT_FOUND`，属明确契约，非隐藏缺陷）；MCP `readResource` 对动态 URI 返回占位符 |

**注意**：MCP HTTP 入站无鉴权（见 §6-1），故「真实调用通过」仅限于 stdio（本机）；HTTP 仅建议 loopback 内使用。

---

## 5. P1-B 图片授权与生产解析接线核查

**已完整（鉴权侧）**：
- `server/routes/images.ts`：`GET /api/images/:name` 需 `requireAuth` + `isValidImageName`（拒绝 `..`/路径穿越）+ `documentImageRepository.isImageAccessible(name)` + 文件存在；`Cache-Control: no-store`。
- `documentImageRepository.isImageAccessible`：`document_images` 行 + 非软删文档 + 活跃 KB 三条件；**`document_images` 是唯一可信归属源，绝不从 `documents.content` 字符串匹配推导**（无注入式越权）。

**未接线（生产侧，阻断）**：
- `docling.ts` `extractAndSaveImages` 从 Markdown 提取 `data:image/...;base64` → 写 `DATA_DIR/images/<uuid>.<ext>`（`flag:'wx'`）→ 改写为 `/api/images/<name>`，但**未调用 `registerImages`**。
- 后果：PDF/DOCX 内嵌图片落盘后被前端引用，`isImageAccessible` 因无 `document_images` 行返回 false → **404**。文本/分块/向量不受影响。
- TB-3 报告 §6-6 已如实记录「本阶段**不接入** document_images（仅验证 + 文档化）」，但本地交付演示会命中此缺口。

---

## 6. 历史高风险问题重新核查（六项 + 新增一项）

| # | 问题 | 核查结论 |
| --- | --- | --- |
| 1 | **HTTP MCP 认证** | ❌ **确认缺口**。`packages/mcp/src/http.ts` 裸 `http.createServer`，入站**无 Bearer 校验**；`server.listen(port)` 绑定全部网卡（日志误写 "localhost"）。外部可无凭证调用其代理的任意工具。**High，阻断** |
| 2 | **MCP SSRF** | ✅ **已修复**。`mcp-url-guard.ts` 仅 http/https、无 userinfo、逐地址 DNS 解析、阻断私有/链路本地/保留/ULA/组播段（loopback 恒允许），`MCP_ALLOW_PRIVATE=1` 显式放行；`mcp-client.ts` 脱敏请求头、2MB 响应上限、5s 超时 |
| 3 | **Agent 资源归属** | ✅ **已修复**（commit d2e0f30）。`agent.service.ts` 将 list/view/update/remove/run/toolCall/toolResult/status/check/stop/resume/agentAsk/trace/artifactList 全部 `userId` 作用域化，`requireOwnedRun` 对越权返回 `resource_not_found` |
| 4 | **软删除访问控制** | ✅ **已修复**。`knowledge.repository.ts` 读取路径一致过滤 `documents.deletedAt IS NULL` + `parentKbActive(documents.kbId)`（findDocumentById L357-361、findKbById L208-212、parentKbActive L167、findSourceById L460） |
| 5 | **Worker 并发写入** | ✅ **已修复**。`parse-commit.repository.ts` 单事务 `FOR UPDATE` 栅栏（job 租约 + `lease_version` + doc `current_parse_job_id` + KB `deleted_at`），抛 `ParseCommitError` LEASE_LOST/CANCELLED/SUPERSEDED/DOCUMENT_GONE |
| 6 | **文件 GC 删除竞态** | ✅ **已缓解 + 文档化**。source-file GC 三重门（归属/保留期/活跃任务）+ dry-run 优先；「分类→删除」极窄窗口已在 TB-3 报告 §7-2 记录为已知限制（最坏重传，不泄露/不越权） |
| 7 | **`doc.import_url` SSRF（本次新增发现）** | ⚠️ **缺口**。`parse-api.service.ts` `importUrl` 直接 `fetch(url, {signal: AbortSignal.timeout(20000)})`，**无 SSRF 防护**（未复用 `checkMcpUrl`）。可被用于访问内网元数据/内部端口。**Medium，建议收尾处理** |

---

## 7. 测试覆盖真实度说明（613 用例构成）

| 类别 | 说明 |
| --- | --- |
| **真实 DB（PostgreSQL + pgvector）** | `tests/parity/*`、`document-images*` 等 DB 套件，经 `assert-test-db.ts` 运行时校验 `current_database() = microera_wiki_test`，走 `apply-migrations.ts`（pg_advisory_lock 幂等迁移）。**613 的主体** |
| **真实 Docling** | 仅 `parse-phase2-docling-e2e.test.ts` 中 `it.skipIf(!doclingReady \|\| !ollamaReady)` 的 happy-path 用例（真实 `real-pdf.pdf`/`real-docx.docx`）+ `parser-integrity` 的 docling 分支 |
| **真实 BGE-M3（Ollama）** | 仅 `vector-retrieval-e2e.test.ts` 中 `it.skipIf(!ollamaReady)` 用例（`/api/tags` 含 `bge-m3` 才启用） |
| **Mock 嵌入** | 其余全部 `vi.spyOn(ollamaEmbedder, 'embedBatch')` / `withDeterministicEmbed`（确定性 1024 维向量） |
| **Mock Docling（故障注入）** | TB-3 全部 14 用例 + phase2 故障用例：`vi.spyOn(doclingParser, 'parseFile').mockRejectedValue(new ParserError(...))` |

**关键结论**：「0 失败、0 跳过」这一数字**依赖** `dbAvailable=true`（5433 测试库可达）、`doclingReady=true`、`ollamaReady=true` 三个运行时探针同时成立。交付/演示机若缺 Ollama 或 Docling，相关用例会**跳过而非失败**——故演示前须确保三者齐备，且「全绿」才有真实意义。真实 Docling 与真实 BGE-M3 的覆盖是「抽查式」（各少量用例），主体质量由确定性 mock 保证。

---

## 8. 未完成迁移 / 不可复现环境 / 密钥泄露排查

- **迁移**：0019 / 0020 / 0021 三个迁移均**未跟踪（未 commit）**，已由测试套件 + server bootstrap 幂等应用，无未落地迁移。风险仅在于「未 commit」——交付打包时须确保纳入版本库。
- **Python/Docling 不可复现**：见 §2.2（无依赖清单、默认 python 3.15b3 vs Python312、硬编码绝对路径）。
- **密钥**：无密钥进版本库；`.env` gitignored 且未读取；`.env.example` 纯占位。

---

## 9. 未关闭问题分级（Critical / High / Medium / Low）

| 级别 | 问题 | 是否阻碍本地交付 |
| --- | --- | --- |
| **High** | HTTP MCP 入站无鉴权 + 绑定全网卡（§6-1） | **是（阻断）** |
| **High** | Docling 图片未登记 `document_images`（P1-B 生产接线不完整，§5） | **是（阻断）** |
| **High** | Docling/Python 环境不可复现（§2.2-2/3） | **是（若换机验收则阻断）** |
| **Medium** | `doc.import_url` SSRF（§6-7，本次新增发现） | 否（可记录，建议收尾） |
| **Medium** | 数据库端口默认 5432 vs 实际 5433（§2.2-1） | 否（`.env` 显式指定即可） |
| **Low** | GC 未接入调度（不改公开 API，TB-3 边界） | 否 |
| **Low** | GC「分类→删除」极窄竞态（已文档化） | 否 |
| **Low** | `db:migrate` 独立路径不建 vector 扩展 | 否（用 server bootstrap） |
| **Low** | Node 版本未固定（无 `engines`） | 否 |
| **Low** | MCP `readResource` 动态 URI 占位符、CLI `not_implemented` 契约 | 否 |
| **Low** | 迁移/新代码未 commit（打包交付须纳入） | 否 |

---

## 10. 最小交付收尾计划（建议顺序，避免新增非必要功能）

1. **（最高优先）HTTP MCP 入站鉴权**：为 `packages/mcp/src/http.ts` 增加入站 Bearer token 校验（复用 `resolveToken` 语义），或交付时**仅限 stdio + loopback 绑定**（`server.listen(port, '127.0.0.1')`），并修正误导性日志。
2. **（P1-B 收尾）Docling 图片登记**：在解析提交路径（`commitParsedDocument` 或其调用点）将 `docling.ts` 提取出的图片名调用 `registerImages(docId, names)`，使 PDF/DOCX 内嵌图片可经 `/api/images/:name` 授权访问。
3. **（复现性）Docling 环境固定**：新增 `requirements.txt`（固定 `docling` 版本）+ 文档化 Python3.12 路径；`start.ps1` 的绝对路径改为环境探测或 `DOCLING_CMD` 可覆盖。
4. **（收尾，低）`doc.import_url` SSRF**：复用 `checkMcpUrl` 或等价白名单/私有段拦截。
5. **（打包）提交迁移与新代码**：将 0019/0020/0021 与新增源码/测试纳入版本库（按既定「先本地验收、后 commit」节奏）。
6. **（记录为已知限制，本轮不做）**：GC 调度、GC 极窄竞态、Node `engines` 固定、`readResource` 动态 URI、CLI `not_implemented`、`db:migrate` 不建扩展——均写入交付说明，不新增功能。

---

## A–E 汇总（对应交付要求）

- **A. 本地交付就绪性**：**NOT READY**（3 项 High 阻断 + 若干可延期项）。
- **B. 阻断项**：(1) HTTP MCP 入站无鉴权；(2) Docling 图片未登记 `document_images`（P1-B 生产接线不完整）；(3) Docling/Python 环境不可复现（换机验收场景）。
- **C. 可延期非阻断项**：`import_url` SSRF（Medium）、端口默认值 5432/5433 差异、GC 调度与竞态、Node `engines`、`readResource` 占位、迁移未 commit。
- **D. 演示步骤**：见 §3（PostgreSQL+pgvector → Ollama → Docling → `.env` → `server:dev` → `worker` → `dev` → CLI → MCP stdio）。
- **E. 最少剩余工作**：见 §10（先 MCP 鉴权 → 再图片登记 → 再 Docling 环境固定 → 再 `import_url` SSRF → 再打包提交；其余记录为已知限制）。
