# 06 — 环境变量 (Environment Variables)

> **目标读者**: DevOps
> **阅读时间**: 10 分钟

---

本文档列出项目中所有环境变量，来源包括 `.env`、`.env.example` 和代码中 `process.env` 的扫描。

## 6.1 环境变量清单

### Server（服务器）

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `PORT` | `3001` | 否 | Express API 服务端口 |
| `JWT_SECRET` | `microera-wiki-mvp-secret-2026` | **是** | JWT 签名密钥。生产环境必须修改为随机字符串。 |

### LLM Provider（LLM 提供商选择）

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `LLM_PROVIDER` | `ollama` | 否 | 可选值: `ollama`（本地）或 `deepseek`（云端）。未设置或非法值时回退到 Ollama。 |

### Ollama（本地 LLM）

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `OLLAMA_URL` | `http://localhost:11434` | 否 | Ollama 服务地址 |
| `OLLAMA_MODEL` | `deepseek-r1:8b` | 否 | 默认模型名（当前 `LLM_PROVIDER=ollama` 时实际使用 `OLLAMA_CHAT_MODEL`） |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b` | 推荐 | Chat / LLM 对话模型 |
| `OLLAMA_EMBED_MODEL` | `bge-m3` | **是** | Embedding 模型。向量搜索和文档导入的必要组件。 |

### DeepSeek（云端 LLM）

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `DEEPSEEK_API_KEY` | 无 | 如 `LLM_PROVIDER=deepseek` 则必填 | DeepSeek API Key。未设置时自动回退到 Ollama。 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 否 | DeepSeek API 地址 |
| `DEEPSEEK_CHAT_MODEL` | `deepseek-v4-flash` | 否 | DeepSeek 模型名。可选: `deepseek-chat`, `deepseek-reasoner`。 |

### Milvus 向量数据库（可选）

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `MILVUS_HOST` | `localhost` | 否 | Milvus 服务地址 |
| `MILVUS_PORT` | `19530` | 否 | Milvus 服务端口 |
| `MILVUS_COLLECTION` | `wiki_entries` | 否 | Milvus 集合名称 |
| `EMBEDDING_DIM` | `1024` | 否 | 向量维度（与 bge-m3 输出一致） |

### PostgreSQL

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/microera_wiki` | **是** | PostgreSQL 连接串。格式: `postgresql://user:password@host:port/database` |

### Vite 前端

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `VITE_API_BASE_URL` | `http://localhost:3001` | 否 | 前端 API 基地址（生产构建时使用） |
| `DISABLE_HMR` | 无 | 否 | 设为 `true` 时禁用 Vite HMR（开发环境热更新） |

### Sandbox 连接器

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `SANDBOX_BASE_URL` | `http://139.196.211.120:6810` | 否 | Sandbox 数据平台地址 |
| `SANDBOX_USERNAME` | `admin` | 否 | Sandbox 登录用户名 |
| `SANDBOX_PASSWORD` | `123456` | 否 | Sandbox 登录密码 |

### Data（数据目录）

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `DATA_DIR` | `./backend/data` | 否 | 数据文件存储目录（上传文件、批量导入源文件） |

### Parser（文档解析）

| 变量 | 默认值 | 必填 | 说明 |
|------|--------|------|------|
| `PARSER_PROVIDER` | `docling` | 否 | 文档解析器。当前仅 `docling` 实现。可注册自定义解析器。 |

---

## 6.2 环境变量模板文件差异

项目包含三个环境变量文件：

| 文件 | 用途 | 是否提交 Git |
|------|------|-------------|
| `.env.example` | 模板文件，不含敏感信息 | ✅ 是 |
| `.env` | 开发环境实际配置（含默认凭据和 API Key） | ❌ 否（.gitignore） |
| `.env.local` | 本地覆盖配置（LLM_PROVIDER=ollama） | ❌ 否 |

### `.env.example` vs `.env` 关键差异

| 变量 | `.env.example` | `.env` |
|------|---------------|--------|
| `LLM_PROVIDER` | 无（默认 ollama） | `deepseek` |
| `DEEPSEEK_API_KEY` | `your-deepseek-api-key-here` | 实际 API Key |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:7b` | `qwen2.5:7b` |
| `SANDBOX_PASSWORD` | 无 | `123456` |
| `DATABASE_URL` | `postgresql://user:password@...` | `postgresql://postgres:postgres@...` |

---

## 6.3 配置场景示例

### 场景 A: 纯本地部署（离线可用）

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen2.5:7b
OLLAMA_EMBED_MODEL=bge-m3
# 不需要 DEEPSEEK_API_KEY
```

### 场景 B: 云端 LLM + 本地 Embedding

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx
DEEPSEEK_CHAT_MODEL=deepseek-v4-flash
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=bge-m3
# Ollama 仅用于 Embedding，LLM 走 DeepSeek 云端
```

### 场景 C: 生产环境（全配置）

```env
PORT=3001
JWT_SECRET=<生成强随机字符串>
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-v4-flash
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=bge-m3
MILVUS_HOST=localhost
MILVUS_PORT=19530
DATABASE_URL=postgresql://microera_prod:<强密码>@localhost:5432/microera_wiki
DATA_DIR=/data/microera-wiki
VITE_API_BASE_URL=https://wiki.example.com
```

---

## 6.4 生成强随机 JWT_SECRET

```bash
# Linux/macOS
openssl rand -base64 48

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```
