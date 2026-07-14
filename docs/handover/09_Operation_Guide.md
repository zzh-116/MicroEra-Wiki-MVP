# 09 — 运维指南 (Operation Guide)

> **目标读者**: SRE
> **阅读时间**: 15 分钟

---

## 9.1 日常检查命令

### 服务健康检查

```bash
# 应用健康
curl http://localhost:3001/api/pipeline/health

# 数据库连接
docker exec microera-postgres psql -U postgres -d microera_wiki -c "SELECT 1;"

# Ollama 状态
curl http://localhost:11434/api/tags

# 条目数量
curl http://localhost:3001/api/entries | python -c "import sys,json; print(len(json.load(sys.stdin)))"
```

### 进程检查

```bash
# 检查 Node.js 进程
ps aux | grep "tsx"

# 检查 Ollama 进程
ps aux | grep ollama

# 检查 PostgreSQL 容器
docker ps | grep microera-postgres
```

---

## 9.2 日志查看

### 应用日志

```bash
# PM2（如使用）
pm2 logs microera-wiki --lines 100

# 直接运行
# 日志输出到 stdout/stderr
npm run server 2>&1 | tee app.log
```

### 关键日志标记

| 日志前缀 | 含义 |
|----------|------|
| `[App]` | Express 应用启动 |
| `[Bootstrap]` | 数据库初始化、种子数据 |
| `[LLM]` | LLM Provider 选择 |
| `[AI]` | AI 对话和 RAG 检索 |
| `[Search]` | 搜索（向量+关键词） |
| `[Import]` | 文档导入管道 |
| `[Embedder]` | Embedding 模型状态 |
| `[Milvus]` | Milvus 连接状态 |
| `[DeepSeek]` | DeepSeek API 请求 |
| `[SSE]` | SSE 流式连接 |
| `[Migrate]` | 数据库迁移 |

### PostgreSQL 日志

```bash
docker compose logs -f postgres --tail 50
```

### Ollama 日志

```bash
# Linux systemd
journalctl -u ollama -f

# 直接运行
ollama serve 2>&1 | tee ollama.log
```

---

## 9.3 GPU 监控

```bash
# 实时 GPU 状态
watch -n 1 nvidia-smi

# 或持续监控
nvidia-smi dmon -s pucvmet -d 2

# 查看 Ollama 是否使用 GPU
# 检查 ollama serve 输出中的 "CUDA" 字样
journalctl -u ollama | grep -i cuda
```

### GPU 内存占用参考

| 模型组合 | 预估 VRAM 占用 |
|----------|---------------|
| 仅 bge-m3 | ~2 GB |
| bge-m3 + qwen2.5:7b (Q4) | ~7 GB |
| bge-m3 + qwen2.5:7b (FP16) | ~15 GB |
| bge-m3 + qwen2.5:14b | ~18 GB |

---

## 9.4 数据库运维

### 数据统计

```bash
docker exec microera-postgres psql -U postgres -d microera_wiki << 'SQL'
-- 条目统计
SELECT entry_type, visibility, count(*) FROM entries WHERE deleted_at IS NULL GROUP BY entry_type, visibility ORDER BY entry_type;

-- 向量统计
SELECT count(*), pg_size_pretty(pg_total_relation_size('vectors')) FROM vectors;

-- 分块统计
SELECT count(*), pg_size_pretty(pg_total_relation_size('document_chunks')) FROM document_chunks;

-- 对话统计
SELECT count(*) FROM conversations;

-- 数据库总大小
SELECT pg_size_pretty(pg_database_size('microera_wiki'));
SQL
```

### 备份数据库

```bash
# 完整备份
docker exec microera-postgres pg_dump -U postgres microera_wiki > wiki_backup_$(date +%Y%m%d_%H%M%S).sql

# 仅备份表结构（不含数据）
docker exec microera-postgres pg_dump -U postgres --schema-only microera_wiki > wiki_schema_$(date +%Y%m%d).sql

# 仅备份数据（不含表结构）
docker exec microera-postgres pg_dump -U postgres --data-only microera_wiki > wiki_data_$(date +%Y%m%d).sql
```

### 恢复数据库

```bash
# ⚠️ 会覆盖现有数据！
docker exec -i microera-postgres psql -U postgres -d microera_wiki < wiki_backup_20260714.sql
```

### 数据库清理

```bash
docker exec microera-postgres psql -U postgres -d microera_wiki << 'SQL'
-- 清理软删除超过 30 天的条目（硬删除）
DELETE FROM entries WHERE deleted_at < NOW() - INTERVAL '30 days';

-- 清理孤立向量（entry 已被删除）
DELETE FROM vectors WHERE entry_id NOT IN (SELECT id FROM entries);

-- 清理孤立分块
DELETE FROM document_chunks WHERE entry_id NOT IN (SELECT id FROM entries);

-- VACUUM 回收空间
VACUUM ANALYZE;
SQL
```

---

## 9.5 Ollama 运维

### 查看已安装模型

```bash
ollama list
```

### 查看模型详情

```bash
ollama show bge-m3
ollama show qwen2.5:7b
```

### 删除模型（释放空间）

```bash
ollama rm <model-name>
```

### 查看运行中的模型

```bash
# 查看当前加载到内存的模型
curl http://localhost:11434/api/ps
```

### 卸载模型（释放内存，不删除）

```bash
# 如果模型被 Keep-Warm 机制保持，可以重启 Ollama
systemctl restart ollama
# 或 pkill ollama && ollama serve &
```

### Ollama 性能调优

```bash
# 设置 Ollama 并发数（环境变量）
# OLLAMA_NUM_PARALLEL=4       # 最大并发请求数
# OLLAMA_MAX_LOADED_MODELS=2  # 最多同时加载几个模型到内存

# Linux systemd 设置:
# /etc/systemd/system/ollama.service
# [Service]
# Environment="OLLAMA_NUM_PARALLEL=4"
# Environment="OLLAMA_MAX_LOADED_MODELS=2"
```

---

## 9.6 Embedding 重建

当以下情况需要重建所有向量：

1. 更换了 Embedding 模型
2. 修改了分块策略
3. 向量数据损坏

```bash
# Step 1: 记录当前模型和配置
echo "Current: EMBED_MODEL=$OLLAMA_EMBED_MODEL, DIM=$EMBEDDING_DIM"

# Step 2: 清空现有向量
docker exec microera-postgres psql -U postgres -d microera_wiki -c "DELETE FROM vectors;"

# Step 3: 重新导入所有条目
# 方式 A: 通过 API 逐一重新导入
curl http://localhost:3001/api/entries | python -c "
import json, requests, sys
entries = json.load(sys.stdin)
for e in entries:
    url = 'http://localhost:3001/api/pipeline/import/string'
    r = requests.post(url, json={'content': e['content'], 'fileName': f\"{e['id']}.md\"})
    print(f\"Entry {e['id']}: {r.status_code}\")
"

# 方式 B: 使用应用自身功能
# TODO: 项目暂未提供一键重建向量的 admin API
```

---

## 9.7 模型更新

### 更新 Embedding 模型

```bash
# 拉取最新版本
ollama pull bge-m3

# 验证新模型
curl http://localhost:11434/api/embeddings -d '{"model": "bge-m3", "prompt": "test"}'

# 无需重启应用（Ollama 自动热加载新版本）
# 但下次调用时可能有短暂的首次加载延迟
```

### 更新 LLM 模型

```bash
# 拉取最新版本
ollama pull qwen2.5:7b

# 修改 .env 指定新模型名
# OLLAMA_CHAT_MODEL=<new-model>

# 重启应用（因为模型名可能变化）
npm run server
```

---

## 9.8 缓存与临时文件清理

```bash
# 清理上传临时文件
rm -rf backend/data/uploads/*
# 或根据配置的 DATA_DIR 路径

# 清理 npm 缓存
npm cache clean --force

# 清理 Docker 未使用的资源
docker system prune -a

# 清理 Ollama 旧模型层
ollama list
# Ollama 不提供直接清理命令，旧层会在 pull 新版本时自动标记
```

---

## 9.9 安全运维

### 定期更新 JWT Secret

```bash
# 生成新 secret
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64'))")

# 更新 .env
# JWT_SECRET=$NEW_SECRET

# 重启应用（所有用户需重新登录）
npm run server
```

### 数据库密码修改

```bash
# 1. 修改 PostgreSQL 密码
docker exec microera-postgres psql -U postgres -c "ALTER USER postgres PASSWORD 'new_password';"

# 2. 更新 .env
# DATABASE_URL=postgresql://postgres:new_password@localhost:5432/microera_wiki

# 3. 更新 docker-compose.yml
# POSTGRES_PASSWORD: new_password

# 4. 重启容器和应用
docker compose down && docker compose up -d
npm run server
```

### 审计日志

```bash
# 查看最近的 AI 对话
docker exec microera-postgres psql -U postgres -d microera_wiki -c "
  SELECT c.id, u.username, c.title, c.created_at
  FROM conversations c JOIN users u ON c.user_id = u.id
  ORDER BY c.created_at DESC LIMIT 20;
"

# 查看最近的操作
# TODO: 项目暂未实现操作审计日志表
```
