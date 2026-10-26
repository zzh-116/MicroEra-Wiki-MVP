# MiqroEra Wiki — 本地交付演示验收报告（Local Demo Acceptance）

- 日期：2026-10-19
- 范围：独立演示环境（Phase 1 安全初始化/隔离/服务/健康 + Phase 2 功能验收）
- 隔离：数据库 `miqroera_demo`、数据目录 `backend/data-demo/`、端口 **3002**（SERVE_STATIC 单端口 SPA）
- 结论：**READY**（功能验收通过；安全事项与 Git 交付准备见第 5/6 节）

> 本文件不含任何密码、JWT、完整 `DATABASE_URL` 或客户数据正文。

---

## 1. Phase 1 — 安全初始化 / 隔离 / 服务 / 健康检查

| # | 检查项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | 演示库为新建（非复用开发/测试库） | PASS | `miqroera_demo` 此前不存在，由运行时 bootstrap 新建 |
| 2 | 迁移仅作用于演示库 | PASS | `_migrations` = **22**（0000–0021） |
| 3 | pgvector 扩展启用 | PASS | `pg_extension` 含 `vector` |
| 4 | 管理员仅种入演示库 | PASS | 演示库 `users` admin = **1**（强随机 ADMIN_PASSWORD，不记录） |
| 5 | 数据库目标 = `miqroera_demo` | PASS | bootstrap 日志：`postgresql://***@localhost:5433/miqroera_demo` |
| 6 | DATA_DIR 隔离 | PASS | `images/`、`sources/`、`tmp/` 仅创建于 `backend/data-demo/` |
| 7 | 开发库 `microera_wiki` 不变 | PASS | 待处理解析任务 **35**、表 **42**（与预检基线一致） |
| 8 | 测试库 `microera_wiki_test` 不动 | PASS | 存在、零写入 |
| 9 | API+SPA 服务启动于 3002 | PASS | `http://localhost:3002/` → 200 text/html，`<title>MiqroEra Wiki MVP</title>`，资源相对路径 `/assets/…` |
| 10 | Worker 面向演示库启动 | PASS | `worker-28836 started (concurrency=2, lease=60s)` |
| 11 | 健康端点 | PASS | `status ok`；数据库已连接；chat `qwen2.5:7b`；embedding `bge-m3`；vectorStore `pgvector` |

## 2. Phase 2 — 功能验收（真实运行）

| # | 步骤 | 结果 | 证据 |
|---|------|------|------|
| 1 | 登录（真实 admin + 强密码） | PASS | `POST /api/auth/login` → 200，`admin` / role `admin`，签发 JWT（188 字符，不记录） |
| 2 | 创建知识库 | PASS | `kb.create` → kb_id **1**「MiqroEra Demo KB」(internal) |
| 3 | 上传 PDF / DOCX / MD | PASS | `doc.upload_file` → document_id **1/2/3** |
| 4 | Worker 解析（Docling） | PASS | 3 个任务全部 `succeeded`；PDF 解析日志「Saved 1 image(s)」，DOCX/MD 成功 |
| 5 | BGE-M3 检索 | PASS | 向量检索：`ZebraQ7`→doc 1 (0.607)、`QuantumNova9`→doc 2 (0.592)、`LunarFalcon3`→doc 3 (0.564) |
| 6 | 分块 + 嵌入落库 | PASS | `knowledge_chunks`=3、`knowledge_vectors`=3 |
| 7 | 图片抽取 + 授权访问 | PASS | `document_images`=1；`GET /api/images/<id>` 带 token → 200 `image/png`（41,871 B），无 token → **401** |
| 8 | CLI 面向演示 API 查询 | PASS | `microera doctor` + `search vector "ZebraQ7"` → doc 1 得分 0.6067（`MICROERA_HOST=http://localhost:3002`） |
| 9 | stdio MCP 面向演示 API 查询 | PASS | 全新 stdio MCP：stderr `API http://localhost:3002 (token set)`；`search_vector` → doc 1 得分 0.6067 |

## 3. 未执行 / 有意排除

- 未改生产业务代码；未 commit / push。
- 未执行真实 GC 删除（无真实对象存储删除）。
- 未改动 `microera_wiki` / `microera_wiki_test` / `postgres` 管理数据。
- 未使用 NUC 或腾讯云环境。

## 4. 环境说明（重要，条件 11）

本会话 Shell 已导出 `MICROERA_HOST=http://localhost:3001`（开发）与一个**开发** `MICROERA_TOKEN`。因 `MICROERA_HOST` 优先级高于 `MICROERA_API_URL`，本会话已连接的 `miqroera` MCP 实际指向**开发后端**，故演示期间**未使用**该 MCP。CLI 与 MCP 验收改用 `MICROERA_HOST=http://localhost:3002` + 演示 token（全新 stdio MCP 服务）完成，正确返回演示数据。切换到 3002 的安全操作见主流程第 3 项说明，未修改任何全局 MCP 配置。

## 5. 独立安全复审状态（2026-10-22 独立复审 PASS）

| 编号 | 事项 | 代码侧状态（工作区已核验） | 独立复审 |
|------|------|---------------------------|----------|
| B-1 | HTTP MCP 入站鉴权 + v2 操作角色授权 | 已实现：默认绑定 `127.0.0.1`（`MCP_HOST` 显式开放）+ 每请求 HS256 JWT 校验；`/api/v2/ops` 统一 `requireAuth`+`requireOperationRole`（default-deny、destructive→admin、`transport:local` 过滤）；`timingSafeEqual` | **PASS**（2026-10-22） |
| B-2 | 图片归属 / 越权访问 | 已实现：`document_images` 可信归属源 + `requireAuth` + 文档/KB active 检查 + 路径穿越防护 + `no-store`；解析提交路径已接线 `savedImages` 登记 | **PASS**（2026-10-22） |
| B-4 | SSRF（MCP 侧 + `doc.import_url`） | 已实现：`validateMcpUrl`→`requestPinned` 单次 DNS 解析 + 钉住 + 默认拒绝 loopback/私网/链路本地/元数据 + `MCP_TRUSTED_HOSTS` 精确白名单 + 拒绝重定向 + 超时/大小上限；`import_url` 走 `safeFetchText`（严格公网） | **PASS**（2026-10-22） |

B-1 / B-2 / B-4 独立安全复审已于 2026-10-22 完成，结论 **PASS**（详见 `docs/parity/final-delivery-acceptance-2026-10-22.md`）。三者代码修复存在于工作区，**均未 commit / push / 部署**（交付打包时须纳入版本库）。

## 6. Git 交付准备状态（截至 2026-10-19）

- 工作区未提交变更：**64 个已跟踪文件修改 + 61 个未跟踪文件**（含迁移 `0019/0020/0021`、`requirements.txt`、图片归属/SSRF/MCP 鉴权相关新增源码与测试）。
- `.gitignore` 当前**未排除** `backend/data-demo/`、`backend/data/images/`、`backend/data/sources/`。
- 本轮未 commit / push / 清理演示库 / 执行 GC 删除（按要求保留）。

## 7. 仍需浏览器人工确认

所有 UI 流程目前仅在 **API 层**完成验收；以下需在浏览器中人工复核后签署：登录页交互、知识库创建表单、文档列表展示、PDF/DOCX 正文渲染、图片内联显示、搜索结果呈现。
