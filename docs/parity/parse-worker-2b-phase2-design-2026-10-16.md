# Phase 2 PDF/Word + 真实向量检索 — 技术设计与依赖核查

- 日期：2026-10-16
- 状态：**设计稿（未实施，等批准）**。本轮不修改代码，仅输出方案 + 依赖核查结论 + 待批准决策清单。
- 范围约束（始终有效）：不 commit、不 push；不迁移开发库/NUC/腾讯云，DB 测试仅 `microera_wiki_test` 且执行 `assertTestDatabase`；暂不接入 document_images（图片独立复审、独立阶段）；不修改旧版 entries / `import-job.service`；不读取或输出敏感正文/JWT/密码；不扩大范围；Schema/API/文件存储决定必须先批准。
- 交付目标：完整代码 + 本地功能演示（不涉及腾讯云/生产部署）。

---

## 0. 结论速览（已验证事实 vs 待实施内容）

### 已验证事实（本轮只读核查，未改任何代码）

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | KB 文档任务入队链 `doc.upload → parseApiService.upload → createAndEnqueue → parseJobService.enqueue → setCurrentParseJob` 完整存在 | `server/routes/knowledge-v2.ts:257`、`backend/services/parse-api.service.ts` |
| F2 | `doc/upload` 只接受 **JSON body**（`content` 文本），**无 multipart / 二进制接收**；`file_path` 是死参数（入参存在但 `upload()` 完全不用） | `parse-api.service.ts:11-19, 92-104` |
| F3 | `sources.uri` 为可空 text、当前 upload 不写入；`documents.file_name/file_size/file_hash` 已存在但仅用于文本字节 | `schema.ts:279-299, 327-365` |
| F4 | `documents` **没有** 存放「上传二进制源文件」的路径/对象键列 | `schema.ts:327-365` |
| F5 | Docling parser **已完整实现**（`parseFile/parseBuffer`、CLI 探测、`convert --from --to md`、`extractAndSaveImages`、`savedImages`），但 **未接入 Worker** | `backend/parser/docling.ts` |
| F6 | ~~**Docling 环境缺失**~~（已纠正，见 §3.1）：该结论基于项目 `.venv`=3.15.0b3 的核查；实测 **稳定 Python 3.12.9 已预装 Docling 2.111.0** | §3.1 实测 |
| F7 | **Ollama 可达**（localhost:11434），**bge-m3:latest 已装**（embedding_length=1024，capabilities=[embedding]）；另有 llava / qwen2.5:7b | 本轮 Bash 核查 |
| F8 | 默认 LLM `ollama.model=deepseek-r1:8b` **未安装**；`chatModel=qwen2.5:7b` 已安装；`embeddingModel=bge-m3` 已安装 | `backend/config.ts` + Bash |
| F9 | 真实向量检索链存在：`retrievalRepository.vectorSearch` 用 `cosineDistance`(pgvector 1024 维)；`lexicalSearch` 用 `to_tsvector/websearch_to_tsquery` | `backend/repositories/retrieval.repository.ts:99-142` |
| F10 | **没有任何测试走「真实 BGE-M3 嵌入 + vectorSearch」端到端**：Phase 1 E2E `vi.spyOn(embedBatch)` 且只断言 `lexicalSearch`；smoke-search 仅断言 `x.vector !== null` 存在性 | `tests/parity/parse-phase1-e2e.test.ts:144,197`、`scripts/smoke-search.ts` |
| F11 | Phase 1 原子提交 `commitParsedDocument` 单事务 fence 门 + 下游写，已实现并被 5 条 E2E 覆盖 | `parse-commit.repository.ts`、`parse-phase1-e2e.test.ts` |
| F12 | `complete()`（job→succeeded）在提交事务**之外**（processor 成功后 `runJob` 再调）；`replayDeadletter` 重建新 job id 时**不重设** `current_parse_job_id` | `parse-worker.service.ts:112`、`parse-job.service.ts:242-272` |
| F13 | `document-image.repository.ts` 的 `registerImages()` **从未被调用**（`savedImages → document_images` 连线缺失）；`server/routes/images.ts` 已有对象级鉴权服务 | `document-image.repository.ts`、`images.ts` |

### 待实施内容（本轮不写代码）

1. 新增二进制（PDF/DOCX）上传入口 + 受控源文件存储（Q2，需批准 Schema/API/存储方案）。
2. Worker→Docling 处理器（Q3，需先解决 Docling 依赖）。
3. `savedImages → document_images` 注册（Q5，**独立阶段，暂缓**）。
4. 真实 BGE-M3 嵌入 + 向量检索的集成测试（Q6）。
5. 两处原子性/边界修复（Q7）。
6. 本地演示最小集（Q8）。

---

## 1. Q1 — 真实调用链与 PDF/Word 缺口

### 现有调用链（已核查）

```
POST /api/v2/ops/doc/upload  (JSON body: {kb_id,title,content,file_name,visibility,folder_id})
  → knowledge-v2.ts:257 → parseApiService.upload(input)
  → createAndEnqueue():  createSource → createDocument(content, parseStatus='pending')
                         → createRevision(rev1) → parseJobService.enqueue({payload:{action:'parse'}})
                         → knowledgeRepository.setCurrentParseJob(docId, jobId)
  → 返回 {document_id, job_id}
  → ParseWorker 认领 → createPureTextProcessor → extract/chunk/embed → commitParsedDocument → complete
```

`import_url` / `parse` / `reparse` 同走 `createAndEnqueue` / `enqueue`，差异仅在 `content` 来源与 `payload.action`。

### 缺失项（PDF/Word 上传要达到闭环所缺的）

| 缺口 | 位置 | 说明 |
| --- | --- | --- |
| G1 二进制接收 | `knowledge-v2.ts` `doc/upload` | 无 multer/multipart；`express.json({limit:'10mb'})` 不适于 50MB 二进制 |
| G2 受控源文件存储 | 无 | `file_path` 是死参数；`documents`/`sources` 无「源二进制落盘路径」字段 |
| G3 源字节校验 | `createAndEnqueue` | `checksum=sha256(content)`、`fileSize=Buffer.byteLength(content)` 对二进制错误（content 为空） |
| G4 Worker 读源文件 | `parse-processor.service.ts` | 纯文本处理器只读 `doc.content`；无「读磁盘源文件 → Docling」分支 |
| G5 Docling 处理器 | 未接入 | `docling.ts` 存在但 `server/worker.ts` 未注入 |
| G6 环境依赖 | 机器 | Docling CLI + Python `docling` 模块均缺失（见 §3） |

---

## 2. Q2 — 受控源文件存储方案（需批准）

### 目标

服务端绝对控制源文件落盘位置，**客户端绝不能指定任意服务器路径**；明确大小/类型/权限/生命周期/清理。

### 安全基线（沿用既有 `files.ts` 的 `resolveDataFilePath` 思路）

1. **拒绝客户端路径**：`UploadInput.file_path` 不再透传，服务端一律忽略；新增的上传字段只接受 `file_name`（原始文件名，仅用于展示/推断扩展名），落盘文件名由服务端生成（`<uuid>.<ext>`，扩展名来自**白名单 MIME 映射**，不信任原始文件名后缀）。
2. **路径穿越防护**：落盘路径 = `path.join(dataDir, 'sources', storedName)`，`storedName` 必须满足 `^[a-f0-9-]{36}\.[a-z0-9]{2,5}$`，并在 resolve 后 `startsWith(dataDir)` 断言；任何不匹配 → 拒绝。
3. **类型/大小白名单**（服务端，与 `ParseOptions.maxFileSize=50MB` 对齐）：

| 类型 | MIME | 扩展名 | 是否 Docling 支持 |
| --- | --- | --- | --- |
| PDF | application/pdf | .pdf | 是 |
| Word | application/vnd.openxmlformats-officedocument.wordprocessingml.document | .docx | 是 |
| Markdown/文本 | text/markdown, text/plain | .md/.txt | 快路径，无需 Docling |
| 其他 | — | — | 拒绝（415） |

4. **大小限制**：`≤ 50MB`（与 `parse-api` 一致），超限 413。
5. **权限**：文件以应用用户读写（0640 或 0600）；目录 `dataDir/sources` 应用私有。
6. **生命周期**：源文件在 `documents.deleted_at` 置位（KB/文档软删）后进入可清理态；`reparse` 复用同一源文件（不重复上传即可重解析）。

### 存储方案决策（三选一，需批准）

| 方案 | Schema 变更 | 说明 |
| --- | --- | --- |
| **S1（推荐）** 复用 `sources.uri` 存相对路径 | 无 | `sources.uri` 已存在且为可空 text，语义本就是「源位置」。上传时写入 `sources/<uuid>.<ext>`（相对 `dataDir`）。对象存储(MinIO)场景写 `object key`（`s3://bucket/key` 或纯 key），由 `objectStorage` 配置判断。代价：uri 语义在 file/url/connector 间略有复用。 |
| S2 新增 `documents.source_file_path` | 1 列 | 语义最清晰、贴近「文档的源文件」，但多一列。 |
| S3 新增 `source_files` 表 | 新表 | 最规范（可存 size/hash/storage backend），但对「单文档单源」MVP 偏重。 |

> **推荐 S1**（零 Schema 变更、复用现有列、支持 reparse）；若需清晰区分本地路径与对象键，S1 仍够用（对象键以 `s3://` 前缀或 `objectStorage` 开关判断）。**待批准后实施。**

### 清理机制（待批准）

- 文档软删 → 源文件标记可清理；由既有清理/GC 流程在宽限期后删除文件，再硬删 DB 行。本轮最小实现：**上传失败/取消即删临时文件**；文档软删时同步删源文件（与 `wiki_files` 清理语义一致）。对象存储场景走对象生命周期策略（本轮不实现）。

---

## 3. Q3 — Worker→Docling 流程 + 环境核查结果

### 环境核查（本轮实测，权威结论）

| 依赖 | 状态 | 结论 |
| --- | --- | --- |
| `docling` CLI | **未安装**（`docling --version` 无输出） | 阻断 G5 |
| Python | 3.15.0b3（**beta**） | Docling 官方支持的 Python 通常 ≤3.12/3.13，3.15b3 大概率不兼容，需另装稳定版 |
| `docling` Python 模块 | **未安装**（ModuleNotFoundError） | 阻断 G5 |
| Ollama 服务 | **可达** | 向量嵌入可行 |
| `bge-m3:latest` | **已装**，1024 维 embedding | 真实嵌入可行 |
| `deepseek-r1:8b`（默认 LLM） | **未安装** | 仅影响 chat 生成，不影响解析/检索 |

> **结论**：Docling 依赖是 Phase 2 PDF/Word 的**硬阻断**。必须先在稳定 Python（建议 3.11/3.12 venv）上安装 Docling，并确认 `docling --version` 与 `python -c "from docling.cli import main"` 均成功，`resolveDoclingCommand()` 才能探测到。

### 3.1 Tier B 环境验证（2026-10-16 实测，权威结论 — 已解除 §3 的阻断）

> §3 的「Docling 环境缺失」结论是基于项目 `.venv`（Python 3.15.0b3 beta）的核查。经本机全量排查，发现**稳定 Python 3.12.9 已预装 Docling 2.111.0**（独立 ML/OCR 解释器，非项目 `.venv`）。以下为逐项实测结果：

| 核查项 | 实测结果 | 结论 |
| --- | --- | --- |
| 稳定 Python | `C:\Users\CAIHUI\AppData\Local\Programs\Python\Python312\python.exe` = **3.12.9**（另有 3.15.0b3 beta） | ✅ 满足 3.11/3.12 要求 |
| Docling 版本 | `docling --version` → **2.111.0**（core 2.86.0 / ibm-models 3.13.3 / parse 7.7.0 / cpython-312 / Windows-11） | ✅ 已安装 |
| Docling 依赖 | `docling-core`/`docling-ibm-models`/`docling-parse`/`docling-slim` + `onnxruntime 1.27.0` + `pypdf 6.14.2` + `pypdfium2` + `rapidocr-onnxruntime` + `torch 2.12.1+cpu` + `transformers 5.13.0` | ✅ 依赖齐备 |
| CLI 入口 | `docling.exe`/`docling-tools.exe` 位于 `Python312\Scripts\`，且 `Python312\Scripts` **在 PATH 上** | ✅ `resolveDoclingCommand()` 首探 `docling --version` 命中 |
| Python 导入探针 | `python -c "from docling.cli import main"` → OK（`resolveDoclingCommand` 的 fallback 探针） | ✅ 探针通过 |
| 真实 PDF 解析 | reportlab 生成 `sample.pdf` → `docling convert sample.pdf --from pdf --to md --output <dir>` → 输出 `sample.md`（标题 + 段落，内容正确） | ✅ 真实可用 |
| 真实 DOCX 解析 | python-docx 生成 `sample.docx` → `--from docx` → 输出 `sample.md`（标题 + 段落逐条分离，内容正确） | ✅ 真实可用 |
| CLI 参数契约 | `--from pdf/docx`、`--to md`、`--output <dir>` 均被 2.111.0 接受；输出文件名 = `<输入基名>.md`，与 `buildDoclingArgs` + `inputBase` 预期一致 | ✅ 兼容 |
| HF 模型 | `~/.cache/huggingface/hub` 已有 `docling-layout-heron`、`docling-models`、Paddle OCR 等（506M），**无需首跑下载** | ✅ 无网络阻断 |

**关于「独立虚拟环境」**：Docling 已位于**独立的 Python 3.12.9 解释器**（与项目 `.venv`=3.15 beta、与 Node 应用均隔离），且解析器只通过子进程调用 `docling` CLI、不 import 进任何应用 Python。因此「隔离」目标已实现，无需且不建议新建冗余 `.venv-docling`（会重复下载 torch/transformers/onnxruntime ~1–2GB）。

**遗留隐患（不影响本轮结论，记录给 Tier B 编码）**：
1. Python 3.12.9 缺失 `venv` / `ensurepip` 标准库模块（`python -m venv` → `No module named venv`）。若后续确需新建 venv，修复方式：`pip install --user virtualenv`（用户级 site，不改系统 site-packages）→ `python312 -m virtualenv <项目>/.venv-docling`。
2. `resolveDoclingCommand()` 的 fallback `python -c ...` 探针会解析到 `.venv`（3.15 beta，无 docling）→ fallback 失效；当前靠首探 `docling --version` 命中 PATH 上的 3.12 `docling.exe`。Tier B 编码建议给 `resolveDoclingCommand` 增加配置覆盖（如 `config.doclingBinPath` / env `DOCLING_BIN`）以显式指向 docling 可执行文件，避免依赖 PATH 顺序。

> **结论：Docling 环境真正可用；Tier B 具备开始编码条件（依赖侧无阻断）。**

### 目标流程（待实施）

```
Worker.claim(job)
  → DoclingProcessor:
      1. findDocumentById(job.document_id)（KB/软删感知 → DOCUMENT_GONE）
      2. 取源文件路径（sources.uri）→ 读磁盘 → 校验文件存在/大小/hash
      3. resolveDoclingCommand() → docling convert <file> --from pdf/docx --to md --output <tmp>
      4. 读生成的 .md → extractElements(markdown) → chunkService.chunk(...)
      5. ollamaEmbedder.embedBatch(...)（事务外，可部分失败）
      6. commitParsedDocument(...)（复用 Phase 1 单事务 fence 提交）
  → complete()
```

- 文本快路径（.md/.txt）与二进制路径**共用同一提交**：`createPureTextProcessor` 与 `createDoclingProcessor` 只在「如何得到 markdown」不同，抽取/分块/嵌入/提交完全一致。
- `resolveDoclingCommand()` 已实现双探测（CLI → python -c），无需改。

---

## 4. Q4 — 复用 Phase 1 fenced 提交（不另开写路径）

**约束（硬性）**：Docling 处理器**不得**绕过 `commitParsedDocument`，不得引入独立写库路径，不得绕过 `lease_owner + lease_version + status='running'` fencing 与 `documents.current_parse_job_id` 版本校验。

- Docling 处理器只做「源字节 → markdown → elements → chunks → vectors」，最终一律调用 `commitParsedDocument(...)`（同一单事务：`parse_jobs FOR UPDATE` → `documents FOR UPDATE` → `knowledge_bases FOR UPDATE` → 内联替换 elements/chunks/vectors + revision + `parse_status='completed'`）。
- 嵌入仍保持在事务外（D3 原则不变）；向量作为参数传入提交。
- `server/worker.ts` 通过注入不同 processor（或一个按 `source.type`/扩展名路由的 composite processor）切换文本/Docling 路径，Worker 骨架、租约、心跳、错误分类代码完全复用。

---

## 5. Q5 — savedImages → document_images 连接（独立阶段）

### 现状（已核查）

- `docling.ts` 的 `extractAndSaveImages()` 会生成 `ParseResult.savedImages`（UUID 文件名落 `DATA_DIR/images`）。
- `document-images` 表 + `document-image.repository.ts` 的 `registerImages()`（幂等 `onConflictDoNothing`）已就绪。
- **但 `registerImages()` 全仓无调用点**：`savedImages` 从未写入 `document_images`；`ingest.service.ts`（旧编排）也不调它。

### 正确连线（待实施，但**独立阶段、暂缓**）

1. 在 `commitParsedDocument` 提交事务内，若 `ParseResult.savedImages` 非空，则 `registerImages(documentId, savedImages, tx)`（与 elements/chunks/vectors 同事务，保证「图片已落盘」与「document_images 行」一致）。
2. 授权链已在 `server/routes/images.ts` 完成：`isImageAccessible(name)` 要求存在 `document_images` 行才放行 → 只有被可信解析登记过的图片才能被访问，`documents.content` 里贴 `/api/images/<name>` 无法提权（P1-B 安全目标）。
3. **为什么暂缓**：图片提取/存储/GC/对象存储一致性问题需独立复审，且 Docling 依赖未就绪时图片提取无法真实验证。故本阶段**只设计、不实施**，也不接 `document_images`。

---

## 6. Q6 — 真实 BGE-M3 向量生成 + 检索链审计

### 现状（已核查）

- **生成**：`ollamaEmbedder.embedBatch` 走 Ollama `/api/embeddings`（批量 input，含并发/顺序降级），模型 `bge-m3`、1024 维；Ollama 侧 `bge-m3:latest` 已装且 embedding 能力确认。**生成链真实可用。**
- **存储**：`knowledge_vectors.embedding vector(1024)`；`commitParsedDocument` 幂等 delete+insert 重建向量。**真实。**
- **检索**：`retrievalRepository.vectorSearch` 用 `cosineDistance(knowledgeVectors.embedding, f.queryVector)` 排序；`lexicalSearch` 用 FTS。**真实。**
- **缺口**：**无测试覆盖「真实嵌入 + vectorSearch」端到端**。Phase 1 E2E 用 `vi.spyOn(embedBatch)` 填确定性向量、且只断言 `lexicalSearch`；`smoke-search.ts` 只断言 `x.vector !== null` 存在、不验证语义排序质量。

### 待实施验证（本阶段核心验收之一）

新增 `tests/parity/vector-retrieval-e2e.test.ts`（**不 spy 嵌入**，连真实 Ollama bge-m3，用 `describe.skipIf` 在 Ollama 不可达时跳过）：

1. 上传两篇**语义相似但无共同关键词**的 markdown（例如同一主题的不同措辞）。
2. 走真实 `createPureTextProcessor`（真实 `embedBatch`）→ `commitParsedDocument`。
3. `retrievalService.vectorSearch({query: 语义问句})` 命中目标 `document_id`（余弦相似），并断言向量维数=1024、`knowledge_vectors` 行数=chunk 数。
4. 反证：`lexicalSearch` 因无共同关键词**不应**命中（证明 vector 与 lexical 是两条独立真实链）。
5. （可选）`hybrid` 与 `explain` 的 RRF 分与 per-source 轨迹非空。

> 该测试不改变生产语义，仅把「已存在但未验证」的真实链钉死。若 bge-m3 不可达则整体 skip，不误报绿。

---

## 7. Q7 — 两处原子性/边界修复

### 7.1 `complete` 与提交事务非原子（F12，Phase 1 已记录残余风险）

**问题**：`commitParsedDocument` 提交成功后，`runJob` 再调 `parseJobService.complete()`（独立 guarded update）。若在提交成功与 complete 之间的微秒窗口租约被回收（`reclaimExpired` 使 `lease_version+1`），`complete` 的 guardedUpdate 失败 → job 回 pending → 新 Worker 幂等重跑 → 多一条 revision（内容正确，非致命，但不干净）。

**修复（推荐）**：把「job→succeeded」**并入提交事务**。`commitParsedDocument` 已在事务内 `SELECT parse_jobs FOR UPDATE` 并校验 `lease_owner/lease_version/status='running'`，顺势在同一事务内 `UPDATE parse_jobs SET status='succeeded', progress=100, stage='done', finished_at=now(), lease_owner=NULL, lease_expires_at=NULL`。此后 `runJob` 末尾的 `complete()` 改为「容忍已 succeeded」的幂等 no-op（或直接移除并靠事务内更新完成）。

- 影响：`parse-commit.repository.ts`（提交事务内追加 parse_jobs 成功更新）+ `parse-worker.service.ts`（去/容忍尾部 complete）。**非 Schema 变更，但改变提交边界，需批准。**

### 7.2 `replayDeadletter` 重建新 job id 的 SUPERSEDED 边缘（F12）

**问题**：原 job 行被删除后，`replayDeadletter` 重建**新 id**，但 `documents.current_parse_job_id` 仍指向旧（已删）id → 重放任务提交时 fence 判 `SUPERSEDED` → 永久失败，重放无效。

**修复（推荐）**：`replayDeadletter` 在「重建新 job」分支成功后调 `knowledgeRepository.setCurrentParseJob(dl.document_id, newJobId)`；「复用原 job id」分支也补一次 `setCurrentParseJob(document_id, originalId)` 以对齐（幂等）。单函数小改，需批准。

---

## 8. Q8 — 本地演示最小集

### 分两层交付（避免被 Docling 阻断整体演示）

**Tier A — 无 Docling（可立即演示，依赖全部就绪）**

| 项 | 内容 | 状态 |
| --- | --- | --- |
| 依赖 | Postgres+pgvector、Ollama(bge-m3) | 已就绪 |
| DB 迁移 | 0021（tests `applyMigrations` 自动应用）；**无新迁移**（Tier A 走纯文本 + 真实嵌入） | 已就绪 |
| 功能 | 纯文本上传 → 真实 BGE-M3 嵌入 → `vectorSearch/lexicalSearch/hybrid/explain` 检索闭环 | 待补验证测试（§6） |
| 启动 | `start.ps1`/server + `npm run worker` + 前端 build | 已就绪 |
| 验收 | `vector-retrieval-e2e.test.ts` 全绿（真实 Ollama） | 待实施 |

**Tier B — Docling PDF/Word（依赖未就绪，需先装 Docling）**

| 项 | 内容 | 状态 |
| --- | --- | --- |
| 依赖 | 稳定 Python 3.11/3.12 venv + `docling` | **缺失，需安装**（见 §3） |
| 依赖 | `docling --version` + `python -c "from docling.cli import main"` 均成功 | **待验证** |
| DB 迁移 | 若选 S2/S3 存储方案，则 +1 迁移（S1 无迁移） | 待批准 |
| 功能 | PDF/DOCX 上传（受控存储）→ Docling 解析 → 抽取/分块/嵌入 → 检索 | 待实施 |
| 验收 | `parse-phase2-docling-e2e.test.ts`（PDF/DOCX 各一篇，真实 Docling，真实 bge-m3） | 待实施 |

> **建议**：先交付 Tier A（零新依赖、零新迁移），再并行推进 Docling 安装与 Tier B。

---

## 9. Q9 — 阶段拆分（独立可测、含验收与阻断）

> 每阶段独立合入、独立测试、不互相阻塞；均遵守 §10 范围约束。

| 阶段 | 内容 | 验收标准 | 阻断/前置 |
| --- | --- | --- | --- |
| **P2-A 真实向量检索验证** | 新增 `vector-retrieval-e2e.test.ts`（真实 bge-m3 嵌入 + vectorSearch + 反证 lexical 不命中） | 测试全绿（Ollama 可达时）；语义检索命中、维度=1024 | 无（依赖已就绪） |
| **P2-B 两处原子性/边界修复** | Q7.1 `complete` 并入提交事务；Q7.2 `replayDeadletter` 重设 `current_parse_job_id` | 现有 5 条 E2E + 新增 2 条（complete-幂等、replay 重建可提交）全绿；typecheck 通过 | 无 |
| **P2-C 受控源文件存储** | Q2 落盘方案（S1 推荐）+ 上传端点忽略 `file_path` + 白名单/大小/穿越防护 + 生命周期清理 | 单测：非法类型/超限/穿越路径被拒；上传成功落 `sources/<uuid>.<ext>`；文档软删后源文件清理 | **Schema/API/存储方案已批准** |
| **P2-D Docling 环境就绪** | 安装稳定 Python + Docling；`resolveDoclingCommand` 探测通过 | `docling --version` 与 `python -c "from docling.cli import main"` 成功；本地 PDF/DOCX 各转出一份 md | 机器环境允许装 Python 3.11/3.12 |
| **P2-E Docling 处理器接入** | `createDoclingProcessor` + worker 路由（文本/Docling）；复用 `commitParsedDocument` | `parse-phase2-docling-e2e.test.ts`：PDF/DOCX 上传→succeeded→completed→检索命中；无新写路径 | P2-C、P2-D |
| **P2-F 图片（独立阶段，暂缓）** | `savedImages → registerImages`（提交事务内） | 独立复审后单独排期；本阶段不实施 | 独立审批 |

---

## 10. Q10 — 未提交修改与迁移保护（本轮与后续均遵守）

- **不 commit / 不 push**：保留当前工作区全部未提交修改（见 git status：大量 M 与新增迁移/文档）。
- **不迁移**开发库/NUC/腾讯云；所有 DB 测试仅 `microera_wiki_test`，且先 `assertTestDatabase` 再 `applyMigrations`（沿用 Phase 1 E2E 模板）。
- 新迁移（若有，S2/S3）仅由测试套件应用到测试库，**不**手动跑生产/开发库。
- 不读取/输出敏感正文、JWT、密码；不扩大范围。

---

## 11. 待批准决策清单（请逐条确认后再实施）

> 以下任何一条未批准，对应阶段不实施。

| 决策 | 内容 | 建议 | 涉及阶段 |
| --- | --- | --- | --- |
| **D-A 存储方案** | 受控源文件落盘：S1 复用 `sources.uri` / S2 新增列 / S3 新表 | **S1**（零 Schema 变更） | P2-C |
| **D-B 上传 API 契约** | 新增 multipart 上传端点（或在 `doc/upload` 增加 multipart 分支）；白名单 PDF/DOCX/MD/TXT、≤50MB、拒绝 `file_path` | 新增 `POST /api/v2/ops/doc/upload-file`（multipart），保留现有 JSON `doc/upload` 不变 | P2-C |
| **D-C 生命周期/清理** | 上传失败/取消即删临时文件；文档软删→删源文件；宽限期可后续加 | 最小：软删即删源文件 | P2-C |
| **D-D Q7.1 提交边界** | `complete` 并入 `commitParsedDocument` 事务 | 是 | P2-B |
| **D-E Q7.2 重放修复** | `replayDeadletter` 重设 `current_parse_job_id` | 是 | P2-B |
| **D-F 演示顺序** | 先 Tier A（无 Docling）后 Tier B（Docling） | 是 | P2-A→E |
| **D-G 图片** | 本阶段不接入 document_images，独立复审后单独排期 | 暂缓 | P2-F |

---

> 本文件为**开发侧**设计与核查，不代表 Codex 独立复审通过（Codex 无额度）。
