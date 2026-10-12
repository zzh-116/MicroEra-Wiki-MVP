# MicroEra Wiki — 本地提交清单（commit ledger）

> 生成时间：2026-10-12T08:33:04.276Z ｜ 当前 HEAD：`d2e0f306f1df98ac1a72969ebe8696989c378d3d`
> 说明：本清单由 `git log` 直接生成，仅本地提交，未推送 GitHub。

```
d2e0f30 Agent object-level authorization (IDOR fix) — scope agent/run ops to authenticated user
2c2992b Batch E: Agent/Harness config honesty + resume/sandbox semantics (E1, E4, E5)
387ff6c Batch D: low-priority defects + Agent/Harness analysis (D7, D8, E6, F8, F12)
ad95a0b Batch C: MCP realness + retrieval/error visibility (E2, E3, F3, F9, F10, F11)
e413101 Batch B: job semantics + real integration tests (B1, C1, F1, F5, F6, F13)
034e3dd Batch A: fix CLI/MCP arg wiring (A1, D1-D6, D8 partial)
fac1e82 docs: add defect audit baseline (29 defects across 6 areas)
67d76a6 docs: point state.json last_verified_commit at closeout HEAD
2b1d340 P10: closeout — migration DR drill + vector fix, coverage/baseline docs, README parity note
5af85fb P9: api/mcp/cli introspection (X01/X02/X03) — 11 ops, full parity 162/162
7142948 P8: model registry (M01/M03) + job dashboard (O01) — 14 ops, full parity 151/162
5bf263a P7: datasource — connector-backed sync (D01/D02/D04) + built-in local connector
97ac1df P6: agent — grounded multi-step runs + tools/MCP/skills/sandbox (A01-A06)
bc78c41 P5: wiki — generate/sources/links/graph + CRUD/versioning over v2 retrieval
67b8ae7 P4: chat — grounded Q&A + sessions/messages/citations/stream over v2 retrieval
d192c6f P3-06: search filtered+metadata — SQL metadata filters + filter schema + search.* CLI+MCP parity
8886ac1 P3-05: retrieval eval — eval.dataset_list/create/run/report/compare (recall@k/MRR/nDCG@k + persisted runs)
84bc016 P3-04: rerank adapter — search.rerank (provider interface, timeout, fallback + scoring trace)
88cd0c6 P3-03: hybrid RRF fusion — search.hybrid + search.explain (deterministic ranking + score trace)
a152269 P3-02: lexical BM25 baseline — Postgres FTS + query normalization (search.lexical)
78db5ff P3-01: vector TopK bugfix — global scored ranking with DB-level ACL filters (search.vector)
4264c2f P2-06: ingest CLI+MCP parity (18 ops: upload/import/parse/wait, elements, chunks, durable jobs + DLQ)
ef4da06 P2-05: ingest orchestration (parse→chunk→embed→publish atomic)
467055a P2-04: durable parse queue (jobs + DLQ, lease/retry/cancel/checkpoint)
3c5b5a0 P2-03: chunk preview/edit (4 strategies + index invalidation)
af43003 P2-02: layout-aware parsed elements (headings/tables/images/pages + blob refs)
7e0a640 P2-01: parser adapters with content integrity (text fallback + sha256 checksum)
c4f220f P1-06: knowledge CLI+MCP parity (generic flag mapping + contract tests)
ddd6bd6 P1-05: knowledge frontend (KB tree + docs list + preview/edit)
1c16a60 P1-04: preview/download/artifacts + kb export/import
9ec7a97 P1-03: knowledge CRUD + folder CoreService, API, operations, tests
443f128 P1-02: legacy entry backfill adapter + read-only dry run
3fac03e P1-01 done → P1-02 in_progress (state.json)
736334e P1-01: knowledge domain schema (KB/Source/Document/Revision) + forward migration
edcd48f P0: close out phase — state.json marks P0-03/04/05 done, advance to P1
15adfe7 P0-05: read-only legacy REST smoke harness (scripts/smoke.ts + npm run smoke)
e63abbc P0-03/04/05: operation registry + contracts + CLI + MCP (stdio/http) skeleton
5bf7d96 P0: harden security — visibility, ownership, roles, secrets
01343a2 Merge remote-tracking branch 'gitlab/main'
0d7b03c Merge branch 'szh/fix-cleanup' into 'main'
```
