# 03 — 部署指南 (Deployment Guide)

> **目标读者**: DevOps
> **阅读时间**: 20 分钟

---

## 3.1 前置条件检查清单

在开始部署前，请逐项确认：

- [ ] 操作系统: Ubuntu 22.04+ / Debian 12+ / Windows Server 2022+
- [ ] Node.js 22 LTS 已安装
- [ ] Python 3.10+ 已安装（Docling 依赖）
- [ ] Docker 24+ 已安装并正常运行
- [ ] Docker Compose v2 已安装
- [ ] Ollama 已安装（用于本地 LLM + Embedding）
- [ ] 网络可访问 `api.deepseek.com`（如使用 DeepSeek 云端 LLM）
- [ ] 网络可访问 Docker Hub（拉取 `pgvector/pgvector:pg16` 镜像）
- [ ] 端口 3000（前端 dev）、3001（API）、5432（PostgreSQL）、11434（Ollama）未被占用

---

## 3.2 部署步骤

### Step 1: 安装 Node.js 依赖

```bash
# 在项目根目录下执行
npm install
```

### Step 2: 配置环境变量

```bash
# 从模板创建 .env
cp .env.example .env

# 编辑 .env，至少需要配置：
# - JWT_SECRET          (必填 — 生产环境使用随机长字符串)
# - LLM_PROVIDER        (必填 — ollama 或 deepseek)
# - DEEPSEEK_API_KEY    (如果 LLM_PROVIDER=deepseek 则必填)
# - DATABASE_URL        (必填 — PostgreSQL 连接串)
# - OLLAMA_URL          (如果 LLM_PROVIDER=ollama 则必填)
# - OLLAMA_CHAT_MODEL   (如果 LLM_PROVIDER=ollama 则必填)
# - OLLAMA_EMBED_MODEL  (必填 — Embedding 模型)
```

详细环境变量说明见 [06_Environment_Variables](./06_Environment_Variables.md)。

### Step 3: 启动 PostgreSQL + pgvector

```bash
# 启动 PostgreSQL 容器
docker compose up -d

# 验证 PostgreSQL 已就绪
docker compose ps
# 输出应显示 microera-postgres 状态为 Up / healthy

# 验证 pgvector 扩展
docker exec microera-postgres psql -U postgres -d microera_wiki -c "SELECT * FROM pg_extension WHERE extname='vector';"
```

### Step 4: (可选) 启动 Milvus（仅大规模向量检索需要）

> **注意**: 当前项目默认使用 pgvector。Milvus 为可选组件。
> 默认配置下不需要启动 Milvus，API 会自动回退到 pgvector。

```bash
# Milvus 需要单独安装和配置
# 请参考: https://milvus.io/docs/install_standalone-docker.md
# 如启用 Milvus, 在 .env 中配置:
#   MILVUS_HOST=localhost
#   MILVUS_PORT=19530
```

### Step 5: 安装并启动 Ollama

```bash
# Linux 安装（如尚未安装）
curl -fsSL https://ollama.com/install.sh | sh

# 启动 Ollama 服务
ollama serve
# 或 systemctl start ollama (Linux systemd)

# 验证 Ollama 运行
curl http://localhost:11434/api/tags
```

### Step 6: 下载 AI 模型

```bash
# 下载 Embedding 模型（必选 — 语义搜索和文档导入都需要）
ollama pull bge-m3
# 模型大小: ~2GB
# 下载时间: 取决于网络，通常 5-30 分钟

# 下载 LLM 模型（如果 LLM_PROVIDER=ollama）
ollama pull qwen2.5:7b
# 模型大小: ~4.7GB
# 可选替代: deepseek-r1:8b (~4.9GB)

# 如果 LLM_PROVIDER=deepseek，则跳过此步
```

详细模型说明见 [07_Model_Configuration](./07_Model_Configuration.md)。

### Step 7: 验证 Ollama 模型加载

```bash
# 检查已下载的模型
ollama list

# 测试 Embedding 模型
curl http://localhost:11434/api/embeddings -d '{
  "model": "bge-m3",
  "prompt": "Hello"
}'
# 应返回 1024 维向量

# 测试 LLM 模型（如果使用 Ollama）
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:7b",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": false
}'
```

### Step 8: 安装 Docling（Python 文档解析器）

```bash
# 需要 Python 3.10+
python --version

# 安装 Docling
pip install docling
# 或 pip3 install docling

# 验证 Docling
docling --version
# 或 python -m docling --version
```

> **注意**: Docling 是项目解析 PDF/DOCX/PPTX 的核心依赖。
> 如不需要文档导入功能，可以跳过此步。但语义搜索功能仍然需要 Embedding 模型。

### Step 9: 启动应用

```bash
# 方式 A: 启动完整服务（API + 前端 SPA）
npm run server
# 访问 http://localhost:3001

# 方式 B: 仅启动 API 服务
npm run backend
# 访问 http://localhost:3001/api/pipeline/health

# 方式 C: 开发模式 — API + 前端分别启动
npm run server:dev &   # 后端
npm run dev             # 前端 (port 3000)
```

### Step 10: 验证部署

```bash
# 健康检查
curl http://localhost:3001/api/pipeline/health | python -m json.tool

# 预期输出:
# {
#   "status": "ok",
#   "pipeline": {
#     "ollama": "http://localhost:11434",
#     "chatModel": "qwen2.5:7b",
#     "embeddingModel": "bge-m3",
#     "vectorStore": "pgvector",
#     "database": "connected"
#   },
#   ...
# }

# 获取条目列表
curl http://localhost:3001/api/entries | python -m json.tool

# 搜索测试
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "量子计算"}' | python -m json.tool
```

---

## 3.3 启动顺序

严格按以下顺序启动：

```
1. Docker (PostgreSQL)     ← 必须先启动
2. Ollama                   ← 数据库就绪后启动
3. 下载模型                 ← Ollama 启动后执行
4. npm run server           ← 模型就绪后启动
5. npm run dev (可选)       ← 最后启动前端
```

---

## 3.4 停止方式

```bash
# 停止 Node.js 应用
# 在运行 npm run server 的终端按 Ctrl+C

# 停止 PostgreSQL 容器
docker compose down

# 停止 Ollama
# 方式 A: 在运行 ollama serve 的终端按 Ctrl+C
# 方式 B: systemctl stop ollama (Linux)
# 方式 C: pkill ollama
```

---

## 3.5 升级方式

### 代码升级

```bash
# 1. 停止应用
# Ctrl+C

# 2. 拉取新代码
git pull origin main

# 3. 安装新依赖
npm install

# 4. 运行数据库迁移（自动在启动时执行）
#    或手动迁移:
npm run db:migrate

# 5. 重启应用
npm run server
```

### 模型升级

```bash
# 升级 Embedding 模型
ollama pull bge-m3
# Ollama 会自动拉取最新版本

# 升级 LLM 模型
ollama pull qwen2.5:7b

# 如需更换模型，修改 .env:
# OLLAMA_CHAT_MODEL=new-model-name
# 然后重启应用
```

---

## 3.6 重新部署（完全清理）

```bash
# 1. 停止所有服务
# Ctrl+C (应用)
docker compose down -v    # -v 删除数据卷！
pkill ollama

# 2. 清理数据（危险！不可逆！）
# 删除 PostgreSQL 数据卷后，所有数据将丢失
docker compose down -v

# 3. 重新执行完整部署流程
docker compose up -d
ollama serve &
ollama pull bge-m3
ollama pull qwen2.5:7b
npm install
npm run server
```

> ⚠️ **警告**: `docker compose down -v` 会删除所有数据库数据！
> 生产环境升级请勿使用 `-v` 参数。

---

## 3.7 生产环境建议

### 使用进程管理器

```bash
# 使用 PM2
npm install -g pm2
pm2 start "npm run server" --name microera-wiki
pm2 save
pm2 startup

# 查看日志
pm2 logs microera-wiki

# 重启
pm2 restart microera-wiki
```

### 使用反向代理 (Nginx)

```nginx
server {
    listen 80;
    server_name wiki.example.com;

    # API + 前端
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;  # SSE 长连接需要较长超时
        proxy_buffering off;      # SSE 流式传输需要关闭缓冲
    }
}
```

### 数据库备份

```bash
# 每日备份 PostgreSQL
pg_dump -U postgres -h localhost microera_wiki > backup_$(date +%Y%m%d).sql

# 使用 cron 自动备份
0 2 * * * pg_dump -U postgres -h localhost microera_wiki > /backups/wiki_$(date +\%Y\%m\%d).sql
```
