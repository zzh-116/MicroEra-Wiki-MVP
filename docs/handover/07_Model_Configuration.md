# 07 — 模型配置 (Model Configuration)

> **目标读者**: ML Ops / DevOps
> **阅读时间**: 10 分钟

---

## 7.1 模型清单

| 模型 | 用途 | 运行位置 | 大小 | 必选 |
|------|------|---------|------|------|
| `bge-m3` | Embedding（文本向量化） | Ollama | ~2 GB | ✅ 是 |
| `qwen2.5:7b` | LLM（对话生成） | Ollama | ~4.7 GB | 如 `LLM_PROVIDER=ollama` |
| `deepseek-r1:8b` | LLM（对话生成，备选） | Ollama | ~4.9 GB | 否 |
| `deepseek-v4-flash` | LLM（对话生成） | DeepSeek 云端 | N/A | 如 `LLM_PROVIDER=deepseek` |

---

## 7.2 Embedding Model: bge-m3

### 基本信息

| 属性 | 值 |
|------|-----|
| 模型全称 | BAAI General Embedding v3 |
| 发布方 | BAAI（北京智源人工智能研究院） |
| 向量维度 | 1024 |
| 最大输入长度 | 8192 tokens |
| 支持语言 | 多语言（中英为主，支持 100+ 语言） |
| Ollama 名称 | `bge-m3` |

### 下载命令

```bash
ollama pull bge-m3
```

### 验证

```bash
curl http://localhost:11434/api/embeddings -d '{
  "model": "bge-m3",
  "prompt": "测试文本"
}'
# 应返回 1024 维浮点数数组
```

### 性能参考

| 硬件 | 单条耗时 | 批量 10 条 |
|------|---------|-----------|
| CPU (8 cores) | ~100ms | ~800ms |
| RTX 3060 (12GB) | ~5ms | ~40ms |
| RTX 4090 (24GB) | ~2ms | ~15ms |

### 替换 Embedding Model

如需替换为其他 Embedding 模型（例如 `nomic-embed-text`）：

```bash
# 1. 下载新模型
ollama pull nomic-embed-text

# 2. 修改 .env
OLLAMA_EMBED_MODEL=nomic-embed-text

# 3. 确认向量维度
# nomic-embed-text 输出 768 维，需同步修改:
EMBEDDING_DIM=768

# 4. 重建向量索引（必须！）
# 向量维度变更后，pgvector 需要重建
docker exec microera-postgres psql -U postgres -d microera_wiki -c "
  DELETE FROM vectors;
  ALTER TABLE vectors ALTER COLUMN embedding TYPE vector(768);
"
# 然后重新导入所有文档以生成新向量

# 5. 重启应用
npm run server
```

> ⚠️ **警告**: 更换 Embedding 模型后，必须重建所有向量。新旧模型的向量空间不兼容。

---

## 7.3 LLM Model: qwen2.5:7b (Ollama 本地)

### 基本信息

| 属性 | 值 |
|------|-----|
| 模型全称 | Qwen 2.5 7B |
| 发布方 | Alibaba Cloud（通义千问） |
| 参数规模 | 7B |
| 上下文长度 | 32768 tokens（Ollama 默认 2048） |
| Ollama 名称 | `qwen2.5:7b` |

### 下载命令

```bash
ollama pull qwen2.5:7b
```

### Ollama 配置调优

Ollama 支持通过 Modelfile 调整参数：

```bash
# 拉取模型
ollama pull qwen2.5:7b

# 创建自定义 Modelfile
cat > Modelfile.qwen << 'EOF'
FROM qwen2.5:7b
PARAMETER temperature 0.3
PARAMETER num_ctx 4096
PARAMETER num_predict 1024
EOF

# 创建自定义模型
ollama create qwen2.5:wiki -f Modelfile.qwen

# 修改 .env
OLLAMA_CHAT_MODEL=qwen2.5:wiki
```

### 替换 LLM Model

```bash
# 拉取新模型
ollama pull llama3.1:8b

# 修改 .env
OLLAMA_CHAT_MODEL=llama3.1:8b

# 重启应用
npm run server
```

---

## 7.4 LLM Model: DeepSeek（云端）

### 基本信息

| 属性 | 值 |
|------|-----|
| API 地址 | `https://api.deepseek.com/v1` |
| 默认模型 | `deepseek-v4-flash` |
| 备选模型 | `deepseek-chat`, `deepseek-reasoner` |
| 上下文长度 | 64K tokens |
| 计费方式 | 按 token 计费 |

### 切换模型

```env
# .env
LLM_PROVIDER=deepseek
DEEPSEEK_CHAT_MODEL=deepseek-chat
```

### API Key 获取

1. 访问 https://platform.deepseek.com
2. 注册/登录
3. API Keys → 创建新 Key
4. 填入 `.env`: `DEEPSEEK_API_KEY=sk-xxxxxxxx`

---

## 7.5 模型预热

应用启动时会对 Embedding 模型进行预热：

```typescript
// backend/app.ts
ollamaEmbedder.warmup();  // 发送 "warmup" 文本强制加载模型
ollamaEmbedder.startKeepWarm();  // 每 4 分钟发送 "keepwarm" 防止 Ollama 卸载模型
```

日志输出：
```
[Embedder] Warmup complete: 1500ms (model: bge-m3)
[Embedder] Keep-warm started (interval: 240s)
```

如果 Ollama 未启动，预热会静默失败，不影响应用启动。
但首次查询的延迟更高（~1.7s 模型加载时间）。

---

## 7.6 模型升级

```bash
# Ollama 模型
ollama pull bge-m3        # 拉取最新版本（覆盖旧版）
ollama pull qwen2.5:7b

# 清理旧版本（可选）
ollama list               # 查看所有版本
# 旧版本会显示为 <none>

# DeepSeek 模型（无本地操作）
# 修改 DEEPSEEK_CHAT_MODEL 环境变量即可切换版本
```

---

## 7.7 量化方式

Ollama 默认使用 `Q4_K_M` 量化（4-bit，平衡质量与速度）。

如需自定义量化：

```bash
# 查看可用量化版本
ollama show qwen2.5:7b

# 拉取特定量化版本
ollama pull qwen2.5:7b-q8_0    # 8-bit 量化（更高质量，更大显存）
ollama pull qwen2.5:7b-q2_K    # 2-bit 量化（更低显存，更低质量）
```

| 量化级别 | 显存占用 | 推理速度 | 质量 |
|---------|---------|---------|------|
| Q2_K | ~2.5 GB | 最快 | 低 |
| Q4_K_M | ~4.7 GB | 快 | 中（默认） |
| Q8_0 | ~7.5 GB | 中等 | 高 |
| F16 | ~14 GB | 慢 | 最高 |
