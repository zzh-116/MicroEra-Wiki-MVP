# Performance & Quality Baseline

> P10-04. Measured live against the running Core Service on
> `http://localhost:3001` and Ollama on `http://localhost:11434` (bge-m3
> embedding, qwen2.5:7b chat) on 2026-10-09. Single-machine, warm-cache
> developer environment; not a load test.

## Model probes

| Model | Probe | Latency | Result |
| --- | --- | --- | --- |
| bge-m3 (embedding) | embed "materials science" | ~213 ms | 1024-dim vector ✓ |
| qwen2.5:7b (chat) | generate "Reply with exactly: ok" | ~4.1 s | "ok" ✓ |

The chat figure includes first-load/warm-up; repeated calls are faster.

## API endpoint latency (single request, authenticated)

| Endpoint | Latency | Notes |
| --- | --- | --- |
| `POST /api/auth/login` | ~133 ms | bcrypt password hash dominates |
| `GET /api/v2/ops/api/operations` | ~4 ms | in-memory registry |
| `GET /api/v2/ops/kb/list` | ~5 ms | Postgres |
| `GET /api/v2/ops/search/metadata` | ~2 ms | static |
| `POST /api/v2/ops/search/vector` | ~200 ms | dominated by bge-m3 embedding |
| `POST /api/v2/ops/model/list` | ~2 ms | Postgres |

Retrieval latency is dominated by the local embedding model; Postgres and the
registry are single-digit milliseconds.

## Quality

- **Correctness:** 382 unit tests passing; 178 live smoke checks passing across
  knowledge, search, chat, wiki, agent, model and meta surfaces.
- **Retrieval quality:** the search smoke verifies vector/lexical/hybrid ranking,
  RRF fusion, DB-level visibility ACL, reranking, metadata filtering, and
  per-hit score traces end-to-end.
- **Grounding quality:** the chat/wiki smokes verify every answer/citation is
  resolvable back to a real chunk (`chat.verify_citations`, `wiki.verify`).
- **Parity:** 162/162 required operations (100%), machine-checked.

## Cost / token note

A token/cost report requires a billable cloud provider. The default
configuration runs fully local (Ollama) with **zero external token cost**; the
DeepSeek cloud path is optional and not exercised in this baseline.
