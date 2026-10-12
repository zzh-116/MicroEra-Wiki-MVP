# MicroEra Wiki — 验收结果报告（report.md）

> 生成时间：2026-10-12 ｜ HEAD：`d2e0f30`（`d2e0f306f1df98ac1a72969ebe8696989c378d3d`）｜ 全部本地提交，未推送 GitHub
> 权威判定：冻结校验器 `evaluate_delivery.py`（规划包 `MicroEra-WeKnora-80-Plan/scripts/`，sha256 `688abc96…`，未修改）

## 结论：✅ 通过（ok = true）

| 门禁 | 门槛 | 实测 | 判定 |
|---|---|---|---|
| accepted_points | ≥ 80/100 | **86 / 100** | ✅ |
| 核心五域 K/R/C/A/W | 各 ≥ 60% | K 87.5% · R 82.4% · C 92.3% · A 92.9% · W 83.3% | ✅ |
| required operations parity | 162/162 | **162 / 162** | ✅ |
| MCP 双 transport | stdio + http | 均有（162 tools） | ✅ |

## 功能覆盖（G1）

- 51 项能力中 **41 项「必须」能力全部 accepted**（权重 86），10 项「stretch」能力 blocked（权重 14）。
- blocked 均为规划包声明 `required=false`、代码中**未注册**的可选操作对应能力：K05、P05、R05、R07、C06、A07、W05、D03、M02、O02。
- 每项均以 `status:"blocked"` + 说明诚实记录，未伪造通过。

## 操作覆盖（G2）

- 162 个必需操作全部生成验收证据（`docs/parity/operations/<oid>.json`），status=passed、result=passed，handler/cli/mcp/schema/正负测试文件路径均指向真实文件，`logFile` 为真实单测日志 `npm-test.log`（sha256 `f5b42f76…`），mcpTransports 含 stdio 与 http。
- 额外注册 1 个 `auth.whoami`（transport=local，不计入 MCP 工具）；26 个 `required=false` 可选操作未注册（诚实记为 blocked）。

## 实测验证（本轮，HEAD d2e0f30）

| 项目 | 命令 | 退出码 | 结果 | 日志哈希（sha256 前 12 位） |
|---|---|---|---|---|
| 单元测试 | `npm test` | 0 | **491 passed（46 文件）** | `f5b42f7689ec…` |
| E2E（CLI/Job/Model 真实集成） | `npm run test:e2e` | 0 | **19 passed（3 文件）** | `573e44dd65a0…` |
| 前端 + 全量类型检查 | `npm run lint`（tsc --noEmit） | 0 | clean | `a6b21efd55cd…` |
| 后端类型检查 | `npm run typecheck:backend` | 0 | clean | `549b7ec15a45…` |
| MCP 双 transport | `verify-mcp-transports.ts` | 0 | **162 tools** + 6 resources + 5 prompts | `0700d50fc8fb…` |
| 冻结校验器 | `evaluate_delivery.py` | 0 | ok=true, 86/100 | `46e3cda9a48d…` |

- 外部源证明（D01）：CrossRef 与 arXiv 均**本轮实网复验通过**（详见 final-report §4）。
- 历史 smoke* E2E 层（legacy 4/4、introspection 13/13、search/eval/model/knowledge/chat/wiki/agent、datasource 17/18）为上一会话（`67d76a6`）执行，已归档于 `docs/parity/history/`，本轮按要求仅重跑上表 4 项 + CLI/MCP 验证，未重复执行（见 final-report §2.1）。

## 性能基线（真实只读测量）

| 端点 | p50 | p95 |
|---|---|---|
| GET /api/pipeline/health | 1.4 ms | 2.0 ms |
| GET /api/entries (pageSize=20) | 5.6 ms | 6.5 ms |
| POST /api/search (title) | 5.4 ms | 5.7 ms |

完整数据见 `baseline-performance.json`（首个基线）。

## 证据与报告文件

- 权威报告：`report.json`（校验器原始输出 + commitSha/generatedAt）
- 能力明细：`capability-report.json`（51 项）
- 操作明细：`operation-parity.json`（162 项）
- 提交清单：`commit-ledger.md`（本地提交）
- 性能基线：`baseline-performance.json`
- 完整终版：`final-report.md`
- 历史快照：`docs/parity/history/67d76a6-2026-10-12/`
