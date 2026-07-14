# 10 — 故障排查 (Troubleshooting)

> **目标读者**: SRE / On-Call
> **阅读时间**: 15 分钟

---

## 10.1 启动失败

### 症状：`npm run server` 启动后立即退出

**排查步骤**：

```bash
# 1. 检查 Node.js 版本
node --version   # 需要 >= 20
npm --version    # 需要 >= 10

# 2. 检查依赖是否完整
npm install
# 如报错，删除 node_modules 重装
rm -rf node_modules && npm install

# 3. 检查 .env 是否存在
ls -la .env
# 如不存在:
cp .env.example .env

# 4. 检查 TypeScript 编译
npx tsc --noEmit
```

---

### 症状：`Error: connect ECONNREFUSED 127.0.0.1:5432`

PostgreSQL 未启动或端口错误。

**排查步骤**：

```bash
# 1. 确认 PostgreSQL 容器运行
docker compose ps
# 状态应为 "Up" 且 "healthy"

# 2. 启动 PostgreSQL
docker compose up -d

# 3. 等待健康检查通过
docker compose ps  # 重复执行直到状态为 healthy

# 4. 直接测试连接
docker exec microera-postgres psql -U postgres -d microera_wiki -c "SELECT 1;"

# 5. 检查端口占用
lsof -i :5432
# Windows: netstat -ano | findstr :5432
```

---

### 症状：`[Milvus] SDK not installed`

Milvus SDK 为可选依赖，此警告可忽略。向量搜索会自动回退到 pgvector。

如需使用 Milvus：
```bash
npm install @zilliz/milvus2-sdk-node
```

---

## 10.2 GPU / CUDA 问题

### 症状：Ollama 不使用 GPU，推理极慢

**排查步骤**：

```bash
# 1. 确认 GPU 可见
nvidia-smi
# 如果报错 "NVIDIA-SMI has failed"，说明驱动问题

# 2. 检查 CUDA 版本
nvcc --version 2>/dev/null || echo "CUDA toolkit not installed"
# 或
cat /usr/local/cuda/version.json 2>/dev/null

# 3. 检查 Ollama 的 GPU 检测
journalctl -u ollama | grep -i "cuda\|gpu"
# 如看到 "no GPU detected" 或 "falling back to CPU"

# 4. 检查 NVIDIA 驱动与 CUDA 兼容性
nvidia-smi | grep "CUDA Version"
# Ollama 需要 CUDA 驱动 >= 11.7

# 5. 如果 Docker 中运行 Ollama
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
# 如报错 "could not select device driver"，安装 NVIDIA Container Toolkit
```

**解决方案**：

```bash
# 重装 NVIDIA 驱动（Ubuntu）
sudo apt update
sudo apt install nvidia-driver-550
sudo reboot

# 安装 CUDA Toolkit
# 下载: https://developer.nvidia.com/cuda-downloads

# 安装 NVIDIA Container Toolkit（Docker GPU 支持）
# 参考: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
```

---

### 症状：`CUDA out of memory`

GPU 显存不足。

**解决方案**：

```bash
# 1. 查看显存占用
nvidia-smi

# 2. 使用更小或量化的模型
ollama pull qwen2.5:3b       # 更小模型
ollama pull qwen2.5:7b-q2_K  # 更低量化

# 3. 只加载必要模型，卸载不用的
curl http://localhost:11434/api/ps  # 查看已加载模型
ollama stop <model>                  # 卸载模型（不删除）

# 4. 如使用 Ollama Docker, 限制可见 GPU
# docker run --gpus '"device=0"' ...  # 仅使用 GPU 0
```

---

## 10.3 Ollama 问题

### 症状：`[Embedder] Warmup failed (Ollama may not be running)`

**排查步骤**：

```bash
# 1. 检查 Ollama 是否运行
curl http://localhost:11434/api/tags
# 如无响应，Ollama 未启动

# 2. 启动 Ollama
ollama serve &
# 或 systemctl start ollama

# 3. 检查 Ollama 日志
journalctl -u ollama -n 50

# 4. 确认模型已下载
ollama list
# 应包含 bge-m3 和 qwen2.5:7b

# 5. 如模型缺失，下载
ollama pull bge-m3
ollama pull qwen2.5:7b
```

---

### 症状：Ollama 响应极慢（>5s）

**可能原因**：
1. 无 GPU，CPU 推理慢
2. 模型刚加载（首次查询需要 ~1.7s 加载时间）
3. 并发请求过多

**排查**：

```bash
# 检查是否有 keep-warm 机制在运行
# 应用日志中应有: [Embedder] Keep-warm started

# 检查 Ollama 并发负载
curl http://localhost:11434/api/ps
```

---

## 10.4 搜索问题

### 症状：语义搜索不工作 / 返回空结果

**排查步骤**：

```bash
# 1. 检查向量是否有数据
docker exec microera-postgres psql -U postgres -d microera_wiki -c "SELECT count(*) FROM vectors;"
# 如果为 0，需要导入文档生成向量

# 2. 测试 Embedding 模型
curl http://localhost:11434/api/embeddings -d '{"model":"bge-m3","prompt":"test"}'
# 应返回 1024 维向量

# 3. 测试 pgvector 搜索
docker exec microera-postgres psql -U postgres -d microera_wiki -c "
  SELECT chunk_id, entry_id, 1 - (embedding <=> (SELECT embedding FROM vectors LIMIT 1)) AS similarity
  FROM vectors
  ORDER BY embedding <=> (SELECT embedding FROM vectors LIMIT 1)
  LIMIT 5;
"

# 4. 查看应用日志中的搜索诊断
# [Search] embed query: XXms
# [Search] vector search: XXms (N hits)
# [Search] chunk texts found: N/M
```

---

### 症状：`entries.map is not a function`

这是已知的代码 bug 相关的错误，通常出现在服务刚启动后。

**排查**：

```bash
# 1. 检查是否有未提交的代码修改
git status

# 2. 确保运行最新代码
git pull origin main

# 3. 重启服务
npm run server
```

---

## 10.5 数据库问题

### 症状：数据库迁移失败

**排查步骤**：

```bash
# 1. 检查迁移记录表
docker exec microera-postgres psql -U postgres -d microera_wiki -c "SELECT * FROM _migrations ORDER BY name;"

# 2. 手动运行迁移
npm run db:migrate

# 3. 如迁移卡住，检查已应用的迁移
# backend/db/migrations/ 目录下的 .sql 文件应与 _migrations 表一致

# 4. 如 pgvector 扩展未安装
docker exec microera-postgres psql -U postgres -d microera_wiki -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

### 症状：`pgvector` 扩展缺失

**解决**：

```bash
docker exec microera-postgres psql -U postgres -d microera_wiki -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

## 10.6 文档导入问题

### 症状：文档上传后导入失败

**排查步骤**：

```bash
# 1. 检查 Docling 是否已安装
docling --version
# 或 python -m docling --version

# 2. 安装 Docling
pip install docling

# 3. 检查 Python 路径
which python
python --version   # 需要 3.10+

# 4. 检查文件大小限制
# 默认 50MB，大文件可能超时
# 查看应用日志中的 [Import] 和 [Upload] 信息

# 5. 测试小文件
echo "# Test" > /tmp/test.md
curl -X POST http://localhost:3001/api/pipeline/import/string \
  -H "Content-Type: application/json" \
  -d '{"content": "# Test\nHello World", "fileName": "test.md"}'
```

---

### 症状：`[Import] Parse FAILED`

常见原因：
1. Docling 未安装
2. 文件格式不支持
3. 文件损坏或为空
4. Python 依赖缺失

**排查**：

```bash
# 检查 Docling 可用
python -c "from docling.document_converter import DocumentConverter; print('OK')"

# 查看详细错误日志
# 应用日志中 [Import] 行包含详细错误信息
# 错误码见 backend/parser/models.ts (ParserError.code)
```

---

## 10.7 DeepSeek API 问题

### 症状：`[LLM] DEEPSEEK_API_KEY not set — falling back to Ollama`

**排查**：

```bash
# 检查 .env 中 DEEPSEEK_API_KEY 是否已设置
grep DEEPSEEK_API_KEY .env

# 检查 LLM_PROVIDER 设置
grep LLM_PROVIDER .env
# 应为 deepseek

# 测试 DeepSeek API 连接
curl https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY"
```

---

### 症状：`DeepSeek API error 401`

API Key 无效或过期。

**解决**：访问 https://platform.deepseek.com 重新生成 API Key。

---

### 症状：`DeepSeek API error 429`

请求频率超限。

**解决**：等待限流窗口重置（通常 1 分钟），或升级 API 套餐。

---

## 10.8 网络 / 端口问题

### 症状：`Port 3001 already in use`

```bash
# 找到占用进程
lsof -i :3001
# Windows: netstat -ano | findstr :3001

# 杀掉进程
kill -9 <PID>
# Windows: taskkill /PID <PID> /F

# 或修改端口
# .env: PORT=3002
```

---

### 症状：前端访问 API 报 CORS 错误

**排查**：

```bash
# 检查 CORS 配置（backend/app.ts 默认允许所有来源）
# 如果修改了 CORS 设置，确保包含前端地址

# 检查 Vite 代理配置（vite.config.ts）
# 前端 dev server 应将 /api 代理到 localhost:3001
```

---

## 10.9 性能问题

### 症状：搜索响应慢（>2s）

**排查**：

```bash
# 1. 检查 Embedding 性能
# 应用日志: [Search] embed query: XXms
# 正常: <200ms (with GPU), <500ms (CPU)
# 慢: >1000ms

# 2. 检查数据库向量搜索
# [Search] vector search: XXms
# 正常: <50ms (pgvector <100K 向量)
# 慢: >500ms

# 3. 检查向量总数
docker exec microera-postgres psql -U postgres -d microera_wiki -c "SELECT count(*) FROM vectors;"

# 4. 添加 pgvector 索引（如不存在）
docker exec microera-postgres psql -U postgres -d microera_wiki -c "
  CREATE INDEX IF NOT EXISTS vectors_embedding_idx ON vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
"
```

---

### 症状：AI 回答延迟高

**排查**：

```bash
# 查看应用日志各阶段耗时:
# [AI] buildRag: getHistory+semanticSearch = XXms  (正常 <300ms)
# [DeepSeek] first token: XXms                       (正常 <2000ms)
# [AI] streamTokens: XXms                            (取决于回答长度)

# 如果 [AI] buildRag 慢，检查:
# - pgvector 向量搜索是否慢
# - document_chunks 表是否缺少索引
```

---

## 10.10 紧急恢复

### 数据库完全损坏，需要从备份恢复

```bash
# 1. 停止应用
# Ctrl+C 或 pm2 stop

# 2. 清空数据库
docker compose down -v

# 3. 重新创建
docker compose up -d

# 4. 恢复备份
docker exec -i microera-postgres psql -U postgres -d microera_wiki < wiki_backup_20260714.sql

# 5. 重启应用
npm run server
```

### 所有向量丢失，需要重建

```bash
# 检查向量是否为空
docker exec microera-postgres psql -U postgres -d microera_wiki -c "SELECT count(*) FROM vectors;"

# 如果为 0，重新导入文档
# TODO: 项目暂未提供一键重建向量的 admin API
# 临时方案: 通过 API 逐条重新导入
```
