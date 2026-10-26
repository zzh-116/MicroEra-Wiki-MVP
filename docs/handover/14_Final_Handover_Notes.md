# 14 — 最终交接备注（Final Handover Notes）

- 日期：2026-10-26
- 性质：离职交接收尾；记录本轮 Git 交付打包、历史敏感数据清理结果，以及接手人必须知道的剩余事项与后果
- 前置阅读：`13_Local_Demo_Acceptance.md`（本地演示验收）、`docs/parity/final-delivery-acceptance-2026-10-22.md`（最终交付验收）

> 本文件不含任何密码、JWT、完整 `DATABASE_URL` 或客户数据正文。

---

## 1. 本轮已完成（Git 交付打包 + 历史清理）

截至 2026-10-26，工作区已从「未 commit / 未 push」状态收尾为**本地交付就绪**：

1. **工作区提交**：全部源码/迁移/测试/文档变更已按逻辑拆分为 8 个提交，落在新分支 **`handover/final`**（HEAD `ea7fad4`）。`wiki-audit/` 目录按要求**保持未跟踪**（不入库）。
2. **Git 历史敏感数据清理**：`git filter-repo` 重写全量历史，删除核心敏感路径 **`backend/data/`**（含其下 `zaozhi/`、`laiguanxue/`、`sources/`、`reports/`、`images/`、`paper2/` 等客户研究资料）、**`BOOT-INF/`**（Spring Boot 编译产物/配置）、**`.understand-anything/`**（AI 工具状态）。
3. **孤儿 LFS 对象清理**：`backend/data/**` 的 PDF/DOCX/PPTX/XLS/XLSX 原经 Git LFS 提交；filter-repo 只删了历史里的指针，真实文件仍留在 `.git/lfs/objects/`（417 对象 / 1.2G）。已用 `git lfs prune --force` 全部清除，并删除失效的 `.gitattributes` LFS 规则。
4. **pre-filter 备份 bundle 已删除**（内含敏感历史的 908M bundle，按「清 git 侧冗余、留原件」决定移除）。
5. **`backend/data/` 原件保留**（约 1.4G，已 `.gitignore` 排除，不会入库/推送），供接手人或演示使用；如需彻底删除另行决定。

## 2. Git 历史重写的影响（接手人必读）

`git filter-repo` 会重写**每一个提交的 SHA**。以下引用旧 SHA 的产物现已失效，须按新历史重新校准：

| 影响 | 说明 |
|------|------|
| **提交数** | 全量历史 345 → **207** 提交（139 个「仅改动敏感路径」的提交被裁空） |
| **分支 SHA 全部变化** | `main`→`3f19b8d`、`handover/final`→`ea7fad4`、`release/v1.0`→`a11e5cd`、`fix/graph-node-label-toggle`→`3cb12ba`、`backup-before-filter`→`8020b24`（以上均为重写后新 SHA） |
| **验收证据 commitSha 失效** | `docs/parity/` 下 `state.json`、`report.json`、`capability-report.json`、`final-report.md` 等记录的 `local_repo_sha` / `last_verified_commit` / 头部注释引用的是重写前 SHA（如 `d2e0f30`、`67d76a6`） |
| **commit-ledger.md 失效** | 全部 46 条旧 SHA 清单需按新历史重新生成（`git log` 重导出即可） |
| **remotes 已移除** | filter-repo 会删除远程引用。push 前必须重加 remote 并 **force-push**（见 §5） |
| **NUC 需重新 clone** | 因历史被重写，gitlab/NUC 上的旧仓库与新历史不兼容，push 后须**删除旧仓库重新 clone**，不能 fast-forward |

> 结论：**功能/测试/文档全部完好**，只有「提交身份」变了。重新生成验收证据（`npm run generate:evidence` 等，如有）或人工注明新 SHA 即可闭合。

## 3. 当前仓库状态

- 分支：`main`、`handover/final`（本轮交付分支）、`release/v1.0`、`fix/graph-node-label-toggle`、`backup-before-filter`。
- `.git` 体积：约 **18M**（清理前 1.2G，其中 1.2G 为孤儿 LFS 对象，已清）。
- 工作区：干净，仅 `wiki-audit/` 未跟踪。
- `backend/data/`：约 1.4G 原件仍在磁盘（gitignored）。

## 4. 剩余人工事项（正式验收前置）

### 4.1 浏览器 UI 全流程人工验收（唯一硬前置）
API 层已全部验收通过，但**浏览器 UI 尚未实际点按**。需在 `http://localhost:3002/` 完成 6 步并签署：

1. 登录（登录页交互、错误提示、登出）
2. 创建知识库（表单校验、成功后刷新）
3. 上传 PDF/DOCX/Markdown（拖拽/选择、进度、失败提示）
4. 查看正文（Markdown 渲染、PDF/DOCX 转写质量）
5. 查看图片（内联显示；如不显示需 `npm run build` 重建前端 bundle）
6. 搜索（搜索框、结果高亮、片段、空结果态）

### 4.2 前端 bundle 重建确认
图片鉴权等前端改动需确认 `dist/` 已通过 `npm run build` 重建并反映最新代码。

## 5. 部署 / 远程状态

- **remotes 已移除**。原地址（从 `.git/config` 的 LFS 段恢复）：
  - `origin`：`https://github.com/zzh-116/MicroEra-Wiki-MVP.git`
  - `gitlab`：`git.miqroera.com`（**NUC 自动部署轮询源**；具体完整 URL 需从 NUC 侧 `.git/config` 或原记录找回）
- **NUC 落后**：重写前本地 main 相对 gitlab 约 **46 个提交未推送**（`commit-ledger.md` 所列即本地未推送清单）。本轮仍**未 push**。
- push 步骤（接手人执行，需授权）：
  1. `git remote add origin <url>`、`git remote add gitlab <url>`
  2. `git push --force-with-lease origin main handover/final ...`
  3. `git push --force gitlab main`（NUC 自动部署感知）
  4. NUC 侧删除旧仓库、重新 clone（历史已重写，无法增量拉取）

## 6. 测试与验收基线

- **全量测试**：`npm test` → **692/692 通过，0 失败 0 跳过**（67 个测试文件，2026-10-22 实测）。
- **类型检查**：前端 `npm run lint`（`tsc --noEmit`）、后端 `tsc --noEmit -p tsconfig.backend.json` → 均 0 错误。
- **操作 parity**：162/162 必需操作通过；`evaluate_delivery.py` 判定 `ok=true`、**86/100**。
- 测试运行于隔离库 `microera_wiki_test`（`assert-test-db` 守卫），不触碰开发/演示库。

## 7. 已知非阻断限制（如实记录，非缺陷）

### 7.1 10 项 stretch 能力 blocked
`K05 / P05 / R05 / R07 / C06 / A07 / W05 / D03 / M02 / O02`（权重合计 14）。原因：对应 26 个 `required=false` 可选操作（tags×5、parser×3、chunk.parent/children、search.multi_kb、session.fork/rewind、memory×3、wiki.refresh/stale/rebuild、datasource.extend/schema、embedding×2、trace×3）在代码中**未注册**，诚实记为 blocked 而非伪造通过。

### 7.2 F2 Job 双后端语义分裂（维持现状）
`job.*` 命名空间指向三个后端，语义不同步：
- `job.list`/`job.view` → `GET /api/pipeline/jobs`（遗留 import 追踪器，进程内内存态）
- `job.wait/cancel/retry/events/artifacts` → `/api/v2/ops/job/*`（持久化 `parse_jobs` 队列）
- `job.parse_status/parse_retry/parse_cancel/deadletters/replay_deadletter` → `server/routes/knowledge-v2.ts`

按用户决定维持现状、如实说明，未实施 F2 迁移（需授权后统一）。

### 7.3 feishu 缺凭据
Feishu 连接器已实现，但**无真实 app_id/app_secret**，外部集成记为 `external_unverified`（未伪造成功）。凭据到位后需补真实集成 E2E。CrossRef / arXiv 等公开源已实网复验通过。

### 7.4 低风险遗留项（既有设计文档已记录）
- ① `complete` 与提交事务非同一事务（微秒窗口租约回收 → 幂等重跑，最多多一条正确 revision）；
- ② `replayDeadletter` 重建 job id 与 `current_parse_job_id` 不匹配的极边缘 SUPERSEDED；
- ③ 取消任务不清理 `current_parse_job_id`（后续 parse 覆盖，可接受）；
- ④ `npm run db:migrate` 单独建库**不执行 `CREATE EXTENSION vector`**（仅运行时 bootstrap 会建），演示须走 `npm run server:dev` 自动 bootstrap。

## 8. 接手人下一步行动清单（按优先级）

1. **浏览器 UI 人工验收**（§4.1，正式验收硬前置）——需人工点按并签署。
2. **重新生成/校准验收证据 SHA**（§2）——`commit-ledger.md` 及 `state.json`/`report.json` 引用旧 SHA。
3. **决定 `backend/data/`（1.4G）去留**——当前保留且 gitignored；如需彻底删除另行执行。
4. **补 feishu 凭据** + 真实集成 E2E（§7.3）。
5. **F2 Job 后端统一**（§7.2，需授权实施迁移）。
6. **push 交付**（§5）：重加 remotes → force-push → NUC 重新 clone。
7. 补齐 10 项 stretch 能力（§7.1，按需排期）。

---

## 附：本轮操作清单（审计留痕）

| 操作 | 结果 |
|------|------|
| `git filter-repo --force --invert-paths --path backend/data/ --path BOOT-INF/ --path .understand-anything/` | 重写历史，敏感路径 0 对象 |
| `git reflog expire --expire=now --all && git gc --prune=now` | 回收不可达对象 |
| `git lfs prune --force` | 清除 417 个孤儿 LFS 对象（1.2G） |
| 删除 pre-filter 备份 bundle | 移除 908M 敏感历史副本 |
| `git rm .gitattributes` + commit `ea7fad4` | 清除失效 LFS 配置 |

> 未执行 push；未迁移开发库 / NUC / 腾讯云；未改动 `backend/data/` 原件。
