# MicroEra MCP 只读功能验收报告（第一轮 + 第二轮）

- 日期：2026-10-13
- 方式：真实调用 microera MCP 工具，只读，未增删改任何数据，未 commit / push
- 敏感信息：不含 JWT / 密码 / 敏感正文（正文均为占位测试文本）

> 本文为新增报告，不覆盖原 G5 结构性验收文件（`docs/parity/final-report.md` 等）。

---

## 一、第一轮（8 次调用）回顾

| # | 工具 | 参数 | ok | 结果 | trace_id |
|---|------|------|----|------|----------|
| 1 | `kb_list` | — | ✅ | 5 个 KB | `2025e2a330207247` |
| 2 | `kb_view` | kb_id=26 | ✅ | document_count=1 | `8e9a58173b087aa0` |
| 3 | `doc_list` | kb_id=26 | ✅ | 1 篇（doc_id=37，parse_status=pending） | `e0e858b3f9f26a44` |
| 4 | `doc_view` | doc_id=37 | ✅ | 文档详情 | `ec28c65effc99289` |
| 5 | `wiki_list` | kb_id=26 | ✅ | 0 页（空集） | `fbc7699d79e0224a` |
| 6 | `wiki_list` | 全局 | ✅ | 1 页 | `39a5d69623afcf9e` |
| 7 | `wiki_search` | q="smoke" | ✅ | 0 命中（空集） | `39bbeecdfb2ac216` |
| 8 | `search_hybrid` | kb_id=26 | ✅ | 0 命中（文档 pending 未入库） | `69552b79176174c7` |

第一轮结论：8/8 成功，0 错误码。搜索命中为 0 是因为 KB #26 唯一文档 `parse_status=pending`，属数据未就绪。

---

## 二、第二轮（12 次调用）——搜索能力与证据可靠性

### 2.1 定位已解析/已索引文档

`doc_list`（全局）返回 **31 篇文档**（trace `dca68c2be4bffcf9`），其中绝大多数 `parse_status=completed`。
选定 **KB #8（Eval KB）** 为测试 KB，其含两篇已完成文档：

- doc_id=12「Zeolite catalysis paper」（`parse_status=completed`）
- doc_id=13「Manuscript illumination」（`parse_status=completed`）

### 2.2 完整调用记录

| # | 工具 | 参数 | ok | 结果 | trace_id |
|---|------|------|----|------|----------|
| 1 | `doc_list` | 全局 | ✅ | 31 篇文档 | `dca68c2be4bffcf9` |
| 2 | `wiki_list` | 全局 | ✅ | 1 页 | `6c6013bee933a77e` |
| 3 | `search_hybrid` | kb_id=8, "zeolite catalysis" | ✅ | **2 命中**，doc_12 得分最高 | `9653823cb75ee798` |
| 4 | `search_vector` | kb_id=8, "zeolite catalysis" | ✅ | **2 命中**，doc_12 得分 0.692 | `d3791c2513e4f45d` |
| 5 | `search_lexical` | kb_id=8, "zeolite catalysis" | ✅ | **1 命中**，doc_12 精确匹配 | `e7f02751e9df0ea9` |
| 6 | `wiki_search` | q="zeolite" | ✅ | **1 命中**（wiki「Zeolites overview」） | `52dbdb01ecc9b24b` |
| 7 | `chunk_list` | doc_id=12 | ✅ | 1 个 chunk（证明已分块/索引） | `e017d81bb433bddd` |
| 8 | `kb_view` | kb_id=9 | ❌ NOT_FOUND | "kb 9 not found"（越权 KB） | `71e56a2c8328c4af` |
| 9 | `kb_view` | kb_id=30 | ❌ NOT_FOUND | "kb 30 not found"（越权 KB） | `c34068c0cbe1b815` |
| 10 | `kb_list` | — | ✅ | 仍为 5 个 KB | `483e660d83876c05` |
| 11 | `search_hybrid` | kb_id=9 | ✅ | 0 命中（越权 KB 返回空，不泄露） | `ff7710e9974fc97d` |
| 12 | `search_hybrid` | kb_id=30 | ✅ | 0 命中（越权 KB 返回空，不泄露） | `f40913bccfc1e7df` |

### 2.3 搜索业务效果验证（关键结论）

对已完成索引的文档，使用真实存在关键词 "zeolite catalysis" 检索：

- **`search_hybrid`**：命中 doc_12（相关，得分 0.0328）与 doc_13（无关，得分 0.0161），相关文档排名靠前 ✅
- **`search_vector`**：doc_12 语义相似度 0.692，远高于无关 doc_13 的 0.281 ✅
- **`search_lexical`**：仅命中 doc_12，精确关键词匹配，无噪声 ✅
- **`wiki_search`**：关键词 "zeolite" 命中 wiki「Zeolites overview」（第一轮 "smoke" 返回 0，说明检索真实生效而非固定返回）✅

**结论**：搜索链路端到端真实可用，能返回非空且相关的命中，且 hybrid/vector/lexical 三种策略对相关文档的排序均正确。

---

## 三、统计

| 轮次 | 调用数 | 成功 | 失败 | 业务非空命中 |
|------|--------|------|------|--------------|
| 第一轮 | 8 | 8 | 0 | 4 |
| 第二轮 | 12 | 10 | 2（均为预期的 NOT_FOUND 越权校验） | 6 |
| 合计 | 20 | 18 | 2* | — |

\* 2 次 `ok:false` 均为对越权 KB 的 `kb_view` 主动校验（`NOT_FOUND`），属预期的访问控制行为，不是功能缺陷。

---

## 四、已验证 / 未验证 / 阻塞 / 剩余风险

### 已验证能力 ✅
1. 知识库只读：`kb_list`、`kb_view`（含文档计数）。
2. 文档只读：`doc_list`（按 KB 过滤 + 全局）、`doc_view`。
3. Wiki 只读：`wiki_list`（按 KB + 全局）、`wiki_search`。
4. 检索：`search_hybrid`（RRF）、`search_vector`、`search_lexical`，对已完成索引文档返回正确排序的非空相关命中。
5. 分块/索引：`chunk_list` 证明文档已分块入库。
6. 越权 KB 的访问控制：`kb_view` 对不可见 KB 返回 `NOT_FOUND`，`search_*` 返回空集，均未泄露越权 KB 数据。

### 未验证能力 ⭕
- 写入类（`doc_upload`/`doc_delete`/`wiki_create`/`wiki_edit`/`kb_create` 等）——按要求未涉及。
- `search_filtered`（元数据过滤）、`search_rerank`、`search_explain`、`wiki_read`/`wiki_graph`/`wiki_sources`/`wiki_verify` 等其余只读工具。
- 多语言 / 长文档 / 分页游标（`next_cursor`）的实际翻页行为。

### 阻塞项 🚧
- 无。存在一条**数据未就绪**边界：KB #26 唯一文档 `parse_status=pending`，导致该 KB 检索命中为 0（非工具缺陷）。已改用 KB #8 的 completed 文档完成验证。

### 剩余安全风险 ⚠️（待确认）
发现一处**疑似水平越权（IDOR）**，建议由开发者确认：

- **现象**：`kb_list` 仅返回 5 个可见 KB；`kb_view(9)`/`kb_view(30)` 均返回 `NOT_FOUND`；但 `doc_list`（全局、不带 kb_id）返回的 31 篇文档中，包含 kb_id ∈ {2,4,5,6,7,9,10,12,13,15,16,17,19,20,21,22,23,24,25,27,28,29,30} 的文档，且响应携带完整 `content` 正文。
- **含义**：文档级枚举（`doc_list`）疑似未按当前用户的 KB 访问范围做对象级鉴权，可能向无权限用户泄露其他 KB 的文档元数据与正文。这与近期「Agent 对象级鉴权（IDOR 修复）」属同类问题，但文档层尚未修复。
- **缓解现状**：`kb_view` 与 `search_*` 已正确 scoping，`doc_view` 未针对越权 doc 单独复测，建议补充。
- **注意**：本环境为单租户沙箱，所有数据可能同属当前用户，若属实则非缺陷；但 `kb_view`（NOT_FOUND）与 `doc_list`（返回文档）的不一致，是需要开发者定性确认的确定性异常。

---

## 五、适合向 mentor 演示的流程

1. **能力链路演示**（只读）：
   - `kb_list` → 展示 5 个可见 KB。
   - `doc_list(kb_id=8)` → 展示已完成解析的文档列表。
   - `search_hybrid(kb_id=8, "zeolite catalysis")` → 展示非空且相关命中、正确排序。
   - `search_vector` / `search_lexical` 同词对比 → 展示三种策略排序差异。
   - `chunk_list(doc_id=12)` → 展示文档已分块索引的证据。
   - `wiki_search("zeolite")` → 展示 Wiki 检索命中。

2. **访问控制演示**（可选，需开发者配合）：
   - `kb_view(kb_id=9)` 返回 `NOT_FOUND`，证明 KB 级鉴权生效。
   - 现场复现 `doc_list`（全局）返回越权 KB 文档，向 mentor 说明疑似 IDOR，供其定性。

3. **数据就绪边界说明**：
   - KB #26 文档 `pending` → 检索命中 0，解释「解析未完成」而非检索失败。

---

*报告结束。所有数据来自真实 MCP 调用返回，未伪造。*
