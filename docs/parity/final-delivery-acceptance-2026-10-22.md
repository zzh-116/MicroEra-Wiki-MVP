# MiqroEra Wiki — 最终交付验收报告（Final Delivery Acceptance）

- 日期：2026-10-22
- 范围：本地代码交付验收（含运行状态、浏览器人工验收步骤、交付说明、安全复审更新、文件清单、Git 状态、全量测试）
- 结论：**具备本地代码交付条件；正式验收需先完成浏览器人工确认**（无安全/功能阻断项）

> 本文件不含任何密码、JWT、完整 `DATABASE_URL` 或客户数据正文。

---

## 0. 结论速览（对应第 9 部分）

| 分类 | 内容 |
|------|------|
| ✅ 已完成 | 5 项服务运行状态实测；B-1/B-2/B-4 独立安全复审 PASS；全量测试 692/692 通过；前后端 TypeScript 检查 0 错误；交付文件清单核对 |
| ⏳ 待人工确认 | 浏览器 UI 全流程人工验收（登录/建库/上传/正文/图片/搜索）——目前仅 API 层验收通过，UI 未实际点按 |
| ⚠️ 已接受风险 | Git 历史残留敏感数据（`.understand-anything/`、`BOOT-INF/classes/`、研究资料 PDF/PPTX/XLS）——**未 push 前本地风险可控**，push 前须另行处理 |
| 🚫 阻断事项 | 无安全/功能阻断项（10-19 审计的 3 项 High 全部关闭） |

---

## 1. 运行状态实测（第 1 项）

| 服务 | 状态 | 证据 |
|------|------|------|
| 演示 API + SPA（单端口 3002，SERVE_STATIC） | ✅ RUNNING | `GET /` → 200 text/html，`<title>MiqroEra Wiki MVP</title>`；`/api/health` → `status ok`、DB 已连接、chat `qwen2.5:7b`、embedding `bge-m3`、vectorStore `pgvector` |
| Worker | ✅ RUNNING | PID 28836，`server/worker.ts`（面向演示库 `miqroera_demo`） |
| PostgreSQL | ✅ RUNNING | Docker 容器 `microera-postgres`（`pgvector/pgvector:pg16`），宿主端口 **5433**，运行中 |
| Ollama | ✅ RUNNING | `http://localhost:11434`，`bge-m3` + `qwen2.5:7b` 模型在位 |
| Docling | ✅ RUNNING | 2.111.0（CPython 3.12.9），经 `DOCLING_CMD`/`DOCLING_PYTHON` 可复现 |

- 开发前端（Vite 3000）与开发 API（3001）亦在运行，与演示环境隔离。

## 2. 浏览器人工验收步骤（第 2、3 项）

> ⚠️ **下述全部为 API 层已验收、浏览器 UI 尚未实际点按的项，均标记为「待人工确认」**。不得将 API 调用成功等同于 UI 验收通过。

| # | 步骤 | 操作 | API 层状态 | UI 层状态 |
|---|------|------|-----------|-----------|
| 1 | 登录 | 打开 `http://localhost:3002/`，用演示 admin 账号登录，确认进入工作台 | ✅ 已验收（`/api/auth/login` 200，签发 JWT） | ⏳ 待人工确认（登录页交互、错误提示、登出） |
| 2 | 创建知识库 | 新建 KB，填写名称/可见性，确认列表出现新 KB | ✅ 已验收（`kb.create` → kb_id 1） | ⏳ 待人工确认（表单校验、成功后刷新） |
| 3 | 上传 PDF/DOCX/Markdown | 分别上传三类文件，确认进入解析队列并完成 | ✅ 已验收（`doc.upload_file` → doc 1/2/3，Worker `succeeded`） | ⏳ 待人工确认（拖拽/选择、进度展示、失败提示） |
| 4 | 查看正文 | 打开文档，确认正文正确渲染 | ✅ 已验收（content 落库正确） | ⏳ 待人工确认（Markdown 渲染样式、PDF/DOCX 转写质量） |
| 5 | 查看图片 | 确认文档内图片内联显示（带鉴权） | ✅ 已验收（`document_images`=1；`GET /api/images/<id>` 带 token 200，无 token 401） | ⏳ 待人工确认（图片是否在页面内联渲染；如未显示需 `npm run build` 重建前端 bundle） |
| 6 | 搜索 | 输入关键词，确认命中相关文档并显示片段 | ✅ 已验收（向量检索 ZebraQ7/QuantumNova9/LunarFalcon3 分别命中 doc 1/2/3） | ⏳ 待人工确认（搜索框、结果高亮、片段展示、空结果态） |

## 3. 完整代码交付说明（第 4 项）

### 3.1 系统架构
- 前端：Vite + React + TypeScript（`src/`），构建产物 `dist/` 由后端 `SERVE_STATIC` 单端口托管。
- 后端：Express 4 `createApp` 工厂（`backend/app.ts`）；`/api/v2/ops` 统一 `requireAuth` + `requireOperationRole`（default-deny）；`/api/images` 鉴权图片；legacy `/api/*` 路由。
- 授权模型：Operation Registry（`packages/operation-registry`）——`OperationDef{id,risk,mcp.scopes,http,transport}` → `requiredRoleFor` 映射 admin/editor/viewer；destructive→admin、`ADMIN_WRITE_SCOPES`→admin、write→editor、read→viewer。
- 鉴权：JWT HS256（`verifyToken` 用 `crypto.timingSafeEqual`）；MCP HTTP 入站按调用方 JWT 鉴权并转发身份。
- Worker：`server/worker.ts`（tsx），租约/fencing 机制消费 `parse_jobs` 队列；解析/分块/嵌入在事务外，下游写库单事务原子提交。
- 解析：Docling CLI（PDF/DOCX/图片抽取，`savedImages` → `document_images` 登记）；纯文本走纯函数分块。
- 检索：BGE-M3 向量（pgvector）+ 词法（Postgres FTS）+ 混合 RRF。
- SSRF：`ssrf-fetch.ts`（`validatePublicUrl`/`validateMcpUrl` → `requestPinned` 单次 DNS + 钉住 + default-deny）。

### 3.2 依赖
- Node 20+（TypeScript + tsx + Vitest + Vite）。
- PostgreSQL 16 + pgvector 扩展（Docker `pgvector/pgvector:pg16`）。
- Ollama（本地 LLM）：`bge-m3`（嵌入）+ `qwen2.5:7b`（chat）。
- Docling 2.111.0（Python 3.10–3.12，见 `requirements.txt`）。

### 3.3 环境变量（关键项，完整见 `.env.example`）
| 变量 | 说明 |
|------|------|
| `PORT` | 后端端口（默认 3001；演示 3002） |
| `JWT_SECRET` | JWT 签名密钥（生产必须强随机；默认仅限本地演示） |
| `DATABASE_URL` | Postgres 连接串（演示 `miqroera_demo` @5433） |
| `OLLAMA_URL` / `OLLAMA_CHAT_MODEL` / `OLLAMA_EMBED_MODEL` | 本地 LLM 与模型 |
| `DATA_DIR` | 数据目录（演示 `backend/data-demo/`） |
| `DOCLING_CMD` / `DOCLING_PYTHON` | Docling 可执行路径与 Python 解释器（3.10–3.12） |
| `MCP_TRUSTED_HOSTS` | Agent MCP SSRF 可信端点白名单（逗号分隔，精确 host[:port]，留空即 default-deny） |
| `MCP_HOST` | MCP 绑定地址（默认 127.0.0.1；显式开放才监听外部） |

### 3.4 数据库初始化与迁移
- 启动时 `runMigrations()` 自动 `CREATE EXTENSION IF NOT EXISTS vector` 并应用 `backend/db/migrations/*.sql`（0000–0021，共 22 项）。
- 手动迁移：`npm run db:migrate`。
- 管理员引导：运行时 bootstrap 在库为空时种入 `admin`（强随机密码，不记录）。
- 演示库 `miqroera_demo` / 开发库 `microera_wiki` / 测试库 `microera_wiki_test`（测试套件经 `assert-test-db` 守卫）。

### 3.5 前后端与 Worker 启动
- 开发前端：`npm run dev`（Vite，3000）。
- 开发后端：`npm run server:dev`（3001）。
- Worker：`npm run worker`（消费解析队列）。
- 生产/演示单端口：`npm run server`（`SERVE_STATIC=1` 托管 SPA + API，3002）。
- 构建前端：`npm run build`（产出 `dist/`，供单端口托管）。

### 3.6 CLI / MCP 连接
- CLI：`microera`（`MICROERA_HOST` 指向 API，`MICROERA_TOKEN` 鉴权）；`microera doctor` 自检。
- MCP stdio：`npm run mcp:stdio`（经 `MICROERA_TOKEN`）。
- MCP HTTP：`npm run mcp:http`（按调用方 JWT 鉴权；`MCP_HOST` 控制监听地址）。

### 3.7 常见故障
| 症状 | 处置 |
|------|------|
| Docling 报 Python 3.15 不支持 | 设 `DOCLING_CMD`/`DOCLING_PYTHON` 指向 Python 3.12 安装（`requirements.txt` 固定 `docling==2.111.0`） |
| 检索为空 / 向量缺失 | 确认 Ollama 在 11434、`bge-m3` 已拉取、pgvector 扩展已启用、Worker 正常消费 |
| 图片 401 / 不显示 | 确认请求带 JWT；如 UI 未内联渲染，重建前端 bundle（`npm run build`） |
| MCP 连接被拒（SSRF） | 目标为非公网地址时，在 `MCP_TRUSTED_HOSTS` 精确加入 `host:port`（勿用通配） |
| 端口占用 | 演示固定 3002、Postgres 5433、Ollama 11434；冲突时改 `.env` |

## 4. 安全验收报告更新（第 5 项）

- **B-1（HTTP MCP 入站鉴权 + v2 操作角色授权）**：独立复审 **PASS**（`packages/mcp/src/auth.ts`、`server/middleware/operation-auth.ts`、`packages/operation-registry/src/authorization.ts`）。
- **B-2（图片归属/越权访问，单组织共享 Wiki 权限模型）**：独立复审 **PASS**（`document_images` 归属源 + `requireAuth` + 文档/KB active 检查 + 路径穿越防护 + `no-store`；解析提交路径已接线 `savedImages`）。
- **B-4（SSRF：MCP 侧 + `doc.import_url`）**：独立复审 **PASS**（`ssrf-fetch.ts` 单次 DNS + 钉住 + default-deny + `MCP_TRUSTED_HOSTS` 精确白名单）。
- **单组织共享 Wiki 权限模型**：单一租户/组织内共享知识库；角色 admin/editor/viewer 分级（`requiredRoleFor`）；对象级授权已按登录用户作用域（Agent 对象级 IDOR 修复已在前序提交）。
- **可信 MCP 端点配置**：`MCP_TRUSTED_HOSTS` 精确 `host[:port]` 白名单，无「开放全部 localhost」开关，default-deny。
- **低风险遗留项**：① `complete` 与提交事务非同一事务（微秒窗口租约回收 → 幂等重跑，最多多一条正确 revision）；② `replayDeadletter` 重建 job id 与 `current_parse_job_id` 不匹配的极边缘 SUPERSEDED；③ 取消任务不清理 `current_parse_job_id`（后续 parse 覆盖，可接受）。三者均为既有设计文档已记录的可接受残余。

## 5. 交付文件清单（第 6 项）

### 5.1 源码
- `backend/`（Express app、config、middleware、repositories、services、parser、db/schema+migrations）
- `server/`（`app.ts` 装配、worker、中间件 `operation-auth.ts`/`auth.ts`）
- `packages/operation-registry/`、`packages/mcp/`（MCP stdio/http + 鉴权 + 工具过滤）
- `src/`（前端 React/TS）
- `cli/`（`microera` CLI）

### 5.2 迁移与 Schema
- `backend/db/migrations/0000–0021`（22 项，含 pgvector、授权列、`document_images`、`current_parse_job_id`）
- `backend/db/schema.ts`（drizzle 模型）

### 5.3 测试与夹具
- `tests/`（Vitest，67 文件 / 692 测试；含 parity 安全/SSRF/鉴权/MCP/parse 一致性用例）
- 测试经 `microera_wiki_test` 隔离库 + `assert-test-db` + `apply-migrations` 运行，不触碰开发/演示库

### 5.4 文档
- `docs/handover/01–13`（项目概览/架构/部署/Docker/环境变量/模型/API/运维/故障/NUC/Docling/本地演示验收）
- `docs/parity/`（各阶段审计、安全修复、本交付报告）
- `README.md`、`.env.example`、`requirements.txt`

### 5.5 完整性结论
- 源码、迁移、测试夹具、文档 **齐全**；无缺失的关键交付物。
- 唯一「未完成」性质：上述文件 **均未 commit/push**（Git 交付打包尚未执行，且 push 前须先处理历史敏感数据，见第 6 项）。

## 6. Git 暂存状态与历史敏感数据风险（第 7 项）

当前工作区状态（截至 2026-10-22）：
- **87 个未暂存修改**（` M`）：前后端源码、配置、测试、文档。
- **61 个未跟踪文件**（`??`）：新增源码/测试/迁移（0019/0020/0021）、`requirements.txt`、交付文档。
- **551 个已暂存删除**（`D `）：主要包括 `.understand-anything/`（代码分析中间产物）、`BOOT-INF/classes/`（Spring Boot 编译产物/配置）、以及研究资料（`paper2/*.pdf`、`savedrecs.txt`、中文 PDF/PPTX/XLS 等）。

**历史敏感数据风险说明**：
- 这些已暂存删除的文件虽已从工作区移除，但**仍存在于本地 `.git` 历史**（既往提交）。
- 若将当前仓库 push 到远程，历史版本会一并上传，泄露客户研究资料及潜在配置凭据。
- **本轮按要求不执行新的清理、不执行历史重写、不 commit、不 push**。风险处于「本地可控、未外泄」状态。
- 正式交付前必须另行安排一次 `git filter-repo` / BFG 历史清理（或重建仓库仅保留当前快照），再决定 push 目标。

## 7. 最终全量测试 + TypeScript 检查（第 8 项）

| 检查 | 结果 | 证据 |
|------|------|------|
| 全量测试 `npm test`（Vitest run） | ✅ **692/692 通过，0 失败，0 跳过** | 67 个测试文件，退出码 0 |
| 前端类型检查 `npm run lint`（`tsc --noEmit`） | ✅ 通过 | 退出码 0 |
| 后端类型检查 `tsc --noEmit -p tsconfig.backend.json` | ✅ 通过 | 退出码 0 |

## 8. 完成度分级（第 9 项）

### ✅ 已完成
1. 5 项服务运行状态实测（API 3002 / Worker / PostgreSQL / Ollama / Docling 全部 RUNNING）。
2. B-1 / B-2 / B-4 独立安全复审 PASS（单组织共享 Wiki 模型）。
3. 全量测试 692/692 + 前后端 TypeScript 检查 0 错误。
4. 交付文件清单核对（源码/迁移/测试/夹具/文档齐全）。
5. 安全验收报告更新（`docs/handover/13_Local_Demo_Acceptance.md` §5）。

### ⏳ 待人工确认
1. 浏览器 UI 全流程验收（登录 → 建库 → 上传 PDF/DOCX/MD → 查看正文与图片 → 搜索）——目前仅 API 层通过，UI 未实际点按。
2. 前端 bundle 是否已重建并反映最新前端代码（如图片鉴权组件）。

### ⚠️ 已接受风险
1. Git 历史残留敏感数据（未 push，本地可控；push 前须另行清理）。
2. 三项已记录的低风险解析残余（见第 4 项「低风险遗留项」）。

### 🚫 阻断事项
**无。** 10-19 审计的三项 High 阻断（HTTP MCP 无鉴权、Docling 图片未登记、Docling 环境不可复现）与 Medium（`import_url` SSRF）全部关闭并经独立复审 PASS。

---

## 9. 四问回答（A/B/C/D）

- **A. 是否具备浏览器人工验收条件？** → **是。** 所有依赖运行中、演示库就绪、前端在 3002 可访问、登录/建库/上传/检索/图片 API 链路已实测通过；浏览器 UI 本身尚未点按，具备条件、待人工执行。

- **B. 哪些交付资料已经完整？** → 源码、22 项迁移与 Schema、测试夹具（692 用例）、文档（handover 01–13 + parity 报告 + 本交付报告）、`.env.example`、`requirements.txt` 均完整。**未完整的是 Git 交付打包本身**（未 commit/push，历史含敏感数据）。

- **C. 是否还存在交付阻断项？** → **安全/功能层面无阻断项。** 剩余非阻断前置：① 浏览器 UI 人工确认（正式验收前置）；② Git 历史敏感数据清理（仅 push 前需要，本轮按要求不做）。

- **D. 是否可以向李世博申请正式验收？** → **可以提出申请**，但应明确两点前置条件：① 先完成浏览器人工验收并签署（第 2 项步骤）；② 若需 push 远程交付，先完成 Git 历史敏感数据清理（另行安排，本轮未做）。
