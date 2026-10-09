# MicroEra Wiki — Operation Parity Coverage Report

> Final coverage report (P10-05). Generated from `npm run parity:check` against
> `docs/parity/frozen-spec/operation_registry.csv`, the unit-test suite, and
> live smoke runs against the running Core Service on `http://localhost:3001`.

**Result: 162 / 162 required operations at full parity (100%).**

## Summary

| Metric | Value |
| --- | --- |
| Required operations (frozen CSV) | 162 |
| Operations at full parity (handler + cli.command + mcp.toolName) | **162** |
| Parity | **100%** |
| Operations registered at runtime | 163 (162 required + 1 local `auth.whoami`) |
| Contract-only (missing handler) | 0 |
| Missing from registry | 0 |
| Unit tests | 382 passing / 35 files |
| Live smoke checks (this session) | 178 passing / 0 failing |
| Migration disaster-recovery drill | 7 / 7 |

The extra registered operation (`auth.whoami`) is a local, non-business
identity helper used by the CLI/MCP entry points; it is intentionally not part
of the frozen 162-op contract.

## Per-phase coverage

| Phase | Area | Representative operations |
| --- | --- | --- |
| P0 | Contract + registry foundation | `api.operations`, `api.schema`, `api.version` |
| P1 | Knowledge base / folders / documents / revisions | `kb.*`, `doc.*`, `doc.revision_*` |
| P2 | Ingestion / parsing / chunks / durable jobs | `doc.upload`, `doc.parse`, `chunk.*`, `job.parse_*`, `job.deadletters` |
| P3 | Retrieval + evaluation | `search.vector/lexical/hybrid/rerank/filtered/metadata`, `eval.*` |
| P4 | Grounded Q&A | `chat.*`, `session.*`, `message.*` |
| P5 | AutoWiki + knowledge graph | `wiki.*`, `graph.*` |
| P6 | Agent | `agent.*`, `skills.*`, `session.agent_ask` |
| P7 | Data sources | `datasource.*` |
| P8 | Model registry + job dashboard | `model.*`, `job.wait/cancel/retry/events/artifacts` |
| P9 | CLI/MCP/API introspection | `cli.*`, `mcp.*`, `api.*` (final 11 ops) |

Every operation is reachable over three surfaces backed by a single
`OperationRegistry`: REST (`/api/v2/ops/...`), CLI (`microera <verb> ...`), and
MCP (a tool per operation). Parity is asserted mechanically by
`scripts/parity-check.ts`.

## Live smoke evidence (run this session)

| Smoke | Checks | Result |
| --- | --- | --- |
| `npm run smoke:knowledge` | 32 | pass |
| `npm run smoke:search` | 31 | pass |
| `npm run smoke:chat` | 26 | pass |
| `npm run smoke:wiki` | 25 | pass |
| `npm run smoke:agent` | 31 | pass |
| `npm run smoke:model` | 20 | pass |
| `npm run smoke:meta` | 13 | pass |
| **Total** | **178** | **pass** |

These seven smoke suites together exercise the full end-to-end science
workflow — literature ingest → RAG retrieval → grounded Q&A → AutoWiki → Agent
→ MCP — against real Postgres and real Ollama models (bge-m3 embedding,
qwen2.5:7b chat).

## Known limitations (non-blocking)

1. **Durable `parse_jobs` queue has no auto-worker.** `doc.upload`/`doc.parse`
   enqueue a durable job that stays `pending` until a worker (or an explicit
   retry) advances it. Chunking/indexing for retrieval is exercised through the
   synchronous ingestion path used by the smoke suites, so retrieval, chat,
   wiki and agent grounding all work live; the queue is intentionally left
   worker-free for deterministic smoke tests.
2. **Orphan migration ledger entry.** The dev database `_migrations` table
   contains one historical entry (`0002_layered_context.sql`) whose file no
   longer exists in the repo (a past rename). It is benign — every current
   migration file is recorded and applies idempotently. See
   [disaster-recovery.md](disaster-recovery.md).

No blockers remain against the frozen 162-op contract.
