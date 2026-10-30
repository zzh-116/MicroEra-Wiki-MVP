
# MicroEra Wiki — 本地提交清单（commit ledger）

> 生成时间：2026-10-30T00:00:00.000Z ｜ 当前 HEAD：`5797e7fd9ee30d6f535c784280b9fdfee8182e51`
> 说明：本清单由 `git log` 直接生成。因 2026-10-30 执行 `git filter-repo` 清理 `analysis-output/`，历史已重写，此前所有旧 SHA 引用已失效。详见 `SHA_INVALIDATION_NOTICE.md`。

```
5797e7f docs: 同步本地项目 CHANGELOG 与 CONTENT_PROGRESS 更新
cf7e996 security(P0.1): 堵死匿名删库链
e87e475 docs(handover): flag analysis-output as push-blocking, fix stale refs
6cabb3f docs(handover): add work content + file inventory (15)
fafb23d docs(handover): add final handover notes + index 13/14
e9c2b9c chore: remove dead Git LFS config after history cleanup
4ce5ef7 chore: frontend content + connector + cli tweaks
3bad241 docs: parity reports, handover 12/13, README, swagger/postman
bc870e0 chore: scripts, deps, and deploy tooling
aa78d7a test: security/parse/image/ssrf integration tests
778b844 feat(worker): durable parse worker with lease fencing + source-file GC
f75c17d feat(security): SSRF guard, MCP HTTP auth, image ownership, op-level authz
fefc242 chore: remove sensitive/runtime data from version control
e5845e7 docs(parity): archive final G5 acceptance evidence
61bec46 Agent object-level authorization (IDOR fix) — scope agent/run ops to authenticated user
8bac760 Batch E: Agent/Harness config honesty + resume/sandbox semantics (E1, E4, E5)
1372143 Batch D: low-priority defects + Agent/Harness analysis (D7, D8, E6, F8, F12)
4383cd6 Batch C: MCP realness + retrieval/error visibility (E2, E3, F3, F9, F10, F11)
5d84f4f Batch B: job semantics + real integration tests (B1, C1, F1, F5, F6, F13)
90866c6 Batch A: fix CLI/MCP arg wiring (A1, D1-D6, D8 partial)
ac95081 docs: add defect audit baseline (29 defects across 6 areas)
6b51256 docs: point state.json last_verified_commit at closeout HEAD
fb342c8 P10: closeout — migration DR drill + vector fix, coverage/baseline docs, README parity note
d18f870 P9: api/mcp/cli introspection (X01/X02/X03) — 11 ops, full parity 162/162
0e7b293 P8: model registry (M01/M03) + job dashboard (O01) — 14 ops, full parity 151/162
64768e3 P7: datasource — connector-backed sync (D01/D02/D04) + built-in local connector
74f65bd P6: agent — grounded multi-step runs + tools/MCP/skills/sandbox (A01-A06)
1ee7bb8 P5: wiki — generate/sources/links/graph + CRUD/versioning over v2 retrieval
98a8bf2 P4: chat — grounded Q&A + sessions/messages/citations/stream over v2 retrieval
ef01b7b P3-06: search filtered+metadata — SQL metadata filters + filter schema + search.* CLI+MCP parity
3c6008e P3-05: retrieval eval — eval.dataset_list/create/run/report/compare (recall@k/MRR/nDCG@k + persisted runs)
d81cde6 P3-04: rerank adapter — search.rerank (provider interface, timeout, fallback + scoring trace)
72e4247 P3-03: hybrid RRF fusion — search.hybrid + search.explain (deterministic ranking + score trace)
b18da68 P3-02: lexical BM25 baseline — Postgres FTS + query normalization (search.lexical)
3ec8631 P3-01: vector TopK bugfix — global scored ranking with DB-level ACL filters (search.vector)
d1dc9e3 P2-06: ingest CLI+MCP parity (18 ops: upload/import/parse/wait, elements, chunks, durable jobs + DLQ)
bd1204d P2-05: ingest orchestration (parse→chunk→embed→publish atomic)
4e84a6e P2-04: durable parse queue (jobs + DLQ, lease/retry/cancel/checkpoint)
3f78a29 P2-03: chunk preview/edit (4 strategies + index invalidation)
7a43950 P2-02: layout-aware parsed elements (headings/tables/images/pages + blob refs)
3cff3dd P2-01: parser adapters with content integrity (text fallback + sha256 checksum)
5fa73f3 P1-06: knowledge CLI+MCP parity (generic flag mapping + contract tests)
c390b98 P1-05: knowledge frontend (KB tree + docs list + preview/edit)
da720fb P1-04: preview/download/artifacts + kb export/import
7085a39 P1-03: knowledge CRUD + folder CoreService, API, operations, tests
2a26b5d P1-02: legacy entry backfill adapter + read-only dry run
53eec90 P1-01 done → P1-02 in_progress (state.json)
423f18a P1-01: knowledge domain schema (KB/Source/Document/Revision) + forward migration
1ce65af P0: close out phase — state.json marks P0-03/04/05 done, advance to P1
752224f P0-05: read-only legacy REST smoke harness (scripts/smoke.ts + npm run smoke)
9b9d98e P0-03/04/05: operation registry + contracts + CLI + MCP (stdio/http) skeleton
a8c165b P0: harden security — visibility, ownership, roles, secrets
b79b756 Merge remote-tracking branch 'gitlab/main'
ce12806 Merge branch 'szh/fix-cleanup' into 'main'
80ccf08 docs: 补充 CONTENT_PROGRESS.md 用户帮助与产品文档类任务
205ec30 refactor: rename MiQi to MiQroForge Desktop and fix navbar wrap
ef89fa0 Merge branch 'szh/fix-cleanup' into 'main'
9e5af86 docs: 规范 CHANGELOG 日期格式并新增 CONTENT_PROGRESS.md 内容进度跟踪
8a3006f Merge branch 'szh/fix-cleanup' into 'main'
f5265b1 feat: 导入后台化、搜索模式优化、AI问答基于当前文档修复
1d3901c docs: 更新 CHANGELOG 记录本次 RAG 修复与文档内检索功能
2b01cbb feat: 实现基于当前文档询问AI功能
790aa7b fix(graph): restore node labels after toggling off and on
61e354a fix: RAG检索精度修复 + 知识索引去重（本地备份）
b5e46e4 fix(deploy): compare full LFS OIDs in ucl-verify-lfs.sh
8fce18b fix(graph): show full node title in inspector instead of truncated label
b39124b docs: normalize CHANGELOG Maintenance heading
de4c202 docs: add CHANGELOG.md covering full project history
a61d197 refactor: migrate hardcoded brand colors to design tokens
484d5e8 chore: drop machine-specific temp path from .gitignore
b34d0bb Merge branch 'feat/knowledge-graph-improvements' into 'main'
7c11658 chore: add test-results ignore rule and preview graph image
8402bef feat(graph): typed relations, brand palette, and global/focused views
e900527 feat: add MinIO object-storage support, audit/migration scripts, and business data docs
deea9b2 feat: store wiki images with Git LFS
be2c2e8 feat: store wiki PDFs with Git LFS
2b683b2 test: add single PDF via Git LFS
8020b24 feat: add cross-document keyword navigation
bf3cc51 feat: upgrade knowledge graph to search-driven explorer
ae68b95 feat: persist semantic graph relations in entry_relations
6dc8025 fix: repair knowledge graph, home stats and duplicate entries
0d9db5e fix: show full knowledge-base counts on search type filters
8feb4b3 Merge branch 'main' of ssh://git.miqroera.com:12222/intership/microera-wiki-mvp
26e08b7 feat: import real desktop data and support new entry types
e41a7c8 Merge branch 'feat/runtime-logging-system' into 'main'
05d6e0f feat: add runtime logging system with admin UI
e66b359 Merge branch 'fix/docx-freeze-and-entrytype-consistency' into 'main'
17df48d fix: prevent UI freeze on large docx + restore docx image rendering
8bd4595 Merge branch 'fix/docx-freeze-and-entrytype-consistency' into 'main'
f9a262a fix: prevent UI freeze when viewing large docx documents + sync EntryType enums
315edb0 Merge feature/rename-import-to-knowledge-import: extract docx images as files
702af1e Merge branch 'main' of ssh://git.miqroera.com:12222/intership/microera-wiki-mvp
02271ae fix: extract embedded images from Docling output as files instead of discarding
28d3ac6 Merge branch 'feature/update-entry-types' into 'main'
2ce6792 fix: update VALID_ENTRY_TYPES to new schema (asset, product, tech, patent, data_item)
8e442d7 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
010a0df Merge branch 'feature/rename-import-to-knowledge-import'
856938f fix: add legacy entry_type fallback mappings for old/invalid types
555a15d fix: add legacy entry_type fallback mappings for old/invalid types
978f895 @ fix: stream binary file upload via XHR instead of buffering in memory
cf31200 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
4977c1d fix: preserve scroll position when sending AI query messages
7e302d3 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
fab2b6f fix: KnowledgeGraph opens entries in new tab from AI Query page
a81dbc7 fix: disable all auto-scroll in AI query chat
ec06607 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
4172a66 fix: prevent auto-scroll to bottom on AI query page load
43b238d Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
e35560e @ feat: redesign AI Query page as MiQi AI Copilot Workspace
d7c5863 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
8fb6087 @ feat: redesign Literature Search page as AI-powered discovery workspace
e177680 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
f01f648 @ feat: redesign Knowledge Entry Detail page as AI-native reading experience
6f9caee Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
b495bbd @ feat: redesign search page as AI-native enterprise search experience
e14e869 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
d1ef6af @ feat: redesign homepage as modern AI-native enterprise landing page
22cc801 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
734ab9c @ feat: redesign Knowledge Import page with modern enterprise SaaS UI
dd079e4 Merge branch 'feature/rename-import-to-knowledge-import' into 'main'
5a9f440 refactor: rename import interface to 知识导入 (Knowledge Import)
4555822 fix: update VALID_ENTRY_TYPES and import default for new 8-type system
29ece3e @ fix: convert all timestamps to Beijing time + wire search filters to API
8669523 feat: replace entry_type system with 8 new content types
d6c46a7 fix: load NVM in auto-deploy.sh so npm build works in systemd env
5a77588 fix: stop chat from jumping during streaming — scroll only on new message, not on token updates
4d5e623 fix: prevent ChatInput focus from scrolling page to bottom
8eafd7e @ fix: prevent ConversationPanel from scrolling the entire page
5dd3dc2 Merge GitLab main — resolve docling.ts conflict
e0cb2b1 fix: prevent page scrolling to bottom on navigation
d1dbd8d Merge branch 'feat/nuc-gitlab-auto-deploy' into 'main'
25ce900 @ fix(docling): show exit code + log full stderr for debugging silent failures
d871852 @ docs: update README with verified NUC auto-deploy config
1815d75 @ feat: switch auto-deploy to GitLab + add NUC one-click setup script
1ee987f feat: add NUC auto-deploy polling + sync handover docs
0998636 @feat: add NUC auto-deploy polling + sync handover docs
b055af7 Merge pull request #4 from zzh-116/feature/bookmarks-and-docling-fix
7cf57d6 Merge branch 'feature/bookmarks-and-docling-fix' into 'main'
3ad4803 @ feat: implement real bookmarks/favorites feature + fix Docling error reporting
0465f0d @ feat: implement real bookmarks/favorites feature + fix Docling error reporting
6b7e40d merge: reconcile with filter-branch rewrite
c236802 Merge branch 'main' of https://github.com/zzh-116/MicroEra-Wiki-MVP
5f12ef2 Merge branch 'main' of https://github.com/zzh-116/MicroEra-Wiki-MVP
f54bcab Merge branch 'main' of https://github.com/zzh-116/MicroEra-Wiki-MVP
c8664c8 refactor: remove Sandbox HTTP mode, fix literature import, add NUC tooling
b974aa5 refactor: remove Sandbox HTTP mode, fix literature import, add NUC tooling
7fb1abd refactor: remove Sandbox HTTP mode, fix literature import, add NUC tooling
e6a40db @ feat: Sandbox DB 直连模式 — 启动自动同步 + 批量导入 + 去重
872ac9c @ feat: Sandbox DB 直连模式 — 启动自动同步 + 批量导入 + 去重
fe3ffb9 @ feat: Sandbox DB 直连模式 — 启动自动同步 + 批量导入 + 去重
a70c141 Merge branch 'main' of ssh://git.miqroera.com:12222/intership/microera-wiki-mvp
821f00d Merge branch 'main' of ssh://git.miqroera.com:12222/intership/microera-wiki-mvp
57ac9c9 Merge branch 'main' of ssh://git.miqroera.com:12222/intership/microera-wiki-mvp
c469d8d docs: add NUC server deployment guide
a33505f docs: add NUC server deployment guide
0302a3c fix: replace real API key with placeholder in NUC deployment guide
f55efb9 fix: replace real API key with placeholder in NUC deployment guide
d24b3f8 docs: add NUC server deployment guide (11_NUC_Deployment.md)
a5bb865 docs: add NUC server deployment guide (11_NUC_Deployment.md)
5529c66 Merge branch 'release/v1.0'
11a2e3b docs: update README and handover docs with literature features
4d18a77 feat: add literature search page with arXiv/CrossRef frontend integration
e5fe9cc feat: complete CrossRef connector and add arXiv connector
463ccb8 fix: polish release quality — HTML title and API 404 handling
b43959c feat: implement Feishu connector sync, improve docling parser, add scripts
06dde11 fix: restore backend/main.ts, swagger docs, and milvus client lost in merge
c878be5 Merge github/main into feat/react-router-migration
a11e5cd chore: update .env.example with Feishu and Sandbox config
9e6d41a feat: real data import, search fixes, and Feishu connector
8012825 @ feat: React Router migration, content renderer, tests, and various improvements
bdea618 Merge remote-tracking branch 'github/main' into feat/react-router-migration
874ddb8 Merge remote-tracking branch 'origin/main' into feat/react-router-migration
e9f8179 feat: real data import, search fixes, and Feishu connector
79d3967 docs: update README for comprehensive project overhaul
e01a2f6 feat: comprehensive Wiki MVP overhaul
45ac486 Merge branch 'feat/react-router-migration' into 'main'
07f734d docs: update README
4962df3 Merge branch 'feat/react-router-migration' into 'main'
de652d8 feat: Sandbox connector, search filtering, pagination, display titles
f66361d chore: improve bug report template with detailed module list, severity levels, and context fields
0887c08 Merge branch 'feat/react-router-migration' into 'main'
88ad8d2 chore: add GitLab bug report issue template
7e6e4ad Merge branch 'feat/react-router-migration' into 'main'
06199b2 @ fix: align frontend file selector with actual Docling backend capabilities
572ea88 Merge branch 'feat/react-router-migration' into 'main'
9c8de9a @ feat: migrate from state-based routing to React Router v6
14ee053 fix: retry Docling CLI discovery every 60s so mid-session pip install takes effect
19ed236 Add start.ps1 startup script with Python PATH setup - start.ps1: one-click backend launcher that sets Python/docling PATH - package-lock.json: npm install update (platform-specific dependencies)
7143ad9 rename swagger.html to index.html
bd2ce8a fix: suppress false 'disconnected prematurely' log for preflight/early TCP closes
21365db fix: heading metadata lost due to CRLF line endings from Docling
3fe16ba feat: readable chunk citations — headings instead of raw chunk IDs
7d64415 fix: triple-defense against Base64 data-URI images in output
cb97c91 fix: Docling CLI integration — safe filenames, format hints, non-fatal errors
1c72eee fix: prevent long/corrupted UTF-8 titles from breaking entry list layout
9230a7c fix: SSE streaming protocol mismatch + RAG chunk persistence
0193313 @ feat: replace JSON file storage with PostgreSQL + Repository Pattern
55d0425 Add runtime data dirs to .gitignore
aa809df Claude-style thinking animation: organic random-interval phrase cycling
7e468ac Dynamic loading animation: cycle through real pipeline steps instead of static text
0881b73 Fix pdf-parse: downgrade to v1.1.1 (v2 has incompatible class-based API)
5f41860 Fix tryLoadModule: extract PDFParse function from module object
dd92a0c Add error logging to pipeline import for debugging
7a2753c Fix pdf-parse/mammoth: use createRequire for CJS modules in ESM context
79c3b3f Fix pdf-parse ESM import: use PDFParse named export instead of default
8cd35e6 Fix file upload: read actual file content + install pdf-parse/mammoth
35dac71 Fix RAG: chunk-level retrieval + critical vector store dedup bug
18ac614 Integrate v0.1.1 rich UI with MVP backend
d030c6d Revert AI endpoints back to Ollama demo mode
1996014 Switch AI from local Ollama to DeepSeek API for Vercel demo
731cb26 Update Vercel config: remove --ignore-scripts from installCommand
f056477 Add Vercel deployment: serverless API functions + vercel.json
```
