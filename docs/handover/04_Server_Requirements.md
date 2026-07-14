# 04 — 服务器需求 (Server Requirements)

> **目标读者**: Platform Lead / Infrastructure
> **阅读时间**: 10 分钟

---

## 4.1 资源需求总表

| 资源 | Minimum | Recommended | Future Scale |
|------|---------|-------------|--------------|
| **CPU** | 4 cores | 8 cores | 16+ cores |
| **Memory** | 16 GB | 32 GB | 64+ GB |
| **GPU** | 推荐（非强制） | 1× NVIDIA GPU 8GB+ VRAM | 2× GPU |
| **GPU 型号** | RTX 3060 / A10 | RTX 4090 / A100 | A100 / H100 |
| **Disk** | 50 GB SSD | 200 GB SSD | 500 GB+ NVMe |
| **OS** | Ubuntu 22.04 | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| **Docker** | 24.0+ | 26.0+ | latest stable |
| **CUDA** | 12.1+ (如有 GPU) | 12.4+ | latest |
| **NVIDIA Driver** | 530+ (如有 GPU) | 550+ | latest |
| **网络** | 100 Mbps | 1 Gbps | 10 Gbps |

---

## 4.2 详细说明

### 4.2.1 CPU

| 场景 | 需求 | 说明 |
|------|------|------|
| PostgreSQL | 2 cores | 基础查询 + pgvector 向量检索 |
| Ollama (CPU mode) | 4-8 cores | 无 GPU 时 LLM 推理很慢（不推荐生产使用） |
| Ollama (GPU mode) | 1-2 cores | GPU 承担推理负载 |
| Docling | 1-2 cores | 文档解析（按需使用） |
| Node.js | 1-2 cores | Express API 服务 |

**建议**: 8 cores 可覆盖日常负载（搜索 + 聊天 + 导入）。

### 4.2.2 Memory

| 组件 | 内存占用 | 说明 |
|------|----------|------|
| PostgreSQL + pgvector | 2-4 GB | 含 shared_buffers 和向量缓存 |
| Ollama (qwen2.5:7b) | 6-8 GB | 7B 模型加载到内存 |
| Ollama (bge-m3) | 2-3 GB | Embedding 模型 |
| Node.js | 512 MB - 1 GB | Express API |
| Docling | 1-2 GB | 按需加载，文档解析时占用 |

**建议**: 32 GB 内存可稳定运行 Ollama 双模型 + 数据库 + 应用。

### 4.2.3 GPU

**GPU 非强制但强烈推荐**。无 GPU 时：

- Embedding 生成速度: ~100ms/条（CPU）vs ~5ms/条（GPU）
- LLM 推理速度: ~5-10 tokens/s（CPU）vs ~50-100 tokens/s（GPU）

| GPU VRAM | 可运行模型 |
|----------|-----------|
| 6 GB | bge-m3 + qwen2.5:3b |
| 8 GB | bge-m3 + qwen2.5:7b (q4 量化) |
| 12 GB | bge-m3 + qwen2.5:7b (fp16) |
| 24 GB+ | bge-m3 + qwen2.5:14b 或更大 |

### 4.2.4 Disk

| 数据 | 预估大小 | 说明 |
|------|----------|------|
| PostgreSQL 数据 | 10-50 GB | 条目、分块、向量（1024 维，每条 ~4KB） |
| 上传文件 | 5-50 GB | 原始 PDF/DOCX 等 |
| Ollama 模型 | 10-20 GB | bge-m3 (~2GB) + qwen2.5:7b (~4.7GB) + deepseek-r1:8b (~4.9GB) |
| Node.js 依赖 | 500 MB | node_modules |
| Python 依赖 | 1-2 GB | Docling + 依赖 |
| 日志 | 1-5 GB/月 | 取决于请求量 |

**建议**: 推荐 SSD（向量检索性能敏感），NVMe 更佳。

---

## 4.3 软件要求

| 软件 | Minimum | Recommended | 必选？ |
|------|---------|-------------|--------|
| **操作系统** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS | - |
| **Docker** | 24.0+ | 26.0+ | ✅ 是 |
| **Docker Compose** | v2.0+ | v2.24+ | ✅ 是 |
| **Node.js** | 20 LTS | 22 LTS | ✅ 是 |
| **npm** | 10.x | 10.x | ✅ 是 |
| **Python** | 3.10 | 3.12 | ✅ 是（Docling 依赖） |
| **pip** | 23.x | 24.x | ✅ 是（Docling 依赖） |
| **Ollama** | latest | latest | ✅ 是（Embedding 必选） |
| **CUDA Toolkit** | 12.1 | 12.4 | 推荐（GPU） |
| **NVIDIA Container Toolkit** | latest | latest | 推荐（GPU + Docker） |
| **Git** | 2.40+ | 2.45+ | 推荐 |
| **PM2** | latest | latest | 推荐（生产进程管理） |
| **Nginx** | 1.24+ | 1.26+ | 推荐（反向代理） |

---

## 4.4 网络要求

### 开放端口

| 端口 | 服务 | 协议 | 对外？ | 说明 |
|------|------|------|--------|------|
| `3001` | Express API | HTTP/SSE | ✅ 是 | 主 API 服务 + Web UI |
| `3000` | Vite Dev Server | HTTP | ❌ 否 | 仅开发环境 |
| `5432` | PostgreSQL | TCP | ❌ 否 | 仅本地访问 |
| `11434` | Ollama | HTTP | ❌ 否 | 仅本地访问 |
| `19530` | Milvus | gRPC | ❌ 否 | 可选，仅本地 |

### 出站访问

| 目标 | 用途 | 必选？ |
|------|------|--------|
| `api.deepseek.com:443` | DeepSeek 云端 LLM | 如果 LLM_PROVIDER=deepseek |
| `registry.npmjs.org:443` | npm 依赖下载 | 安装/更新时 |
| `pypi.org:443` | Python 依赖下载 | 安装 Docling 时 |
| `hub.docker.com:443` | Docker 镜像拉取 | 首次部署时 |
| `github.com:443` | 代码拉取 | 部署/更新时 |

---

## 4.5 GPU 配置（可选但推荐）

### 验证 GPU 可用

```bash
# 检查 NVIDIA 驱动和 GPU
nvidia-smi

# 检查 CUDA 版本
nvcc --version

# 检查 Docker GPU 支持
docker run --rm --gpus all nvidia/cuda:12.4.0-base-ubuntu22.04 nvidia-smi
```

### Ollama GPU 配置

Ollama 默认自动检测并使用 GPU。无需额外配置。
验证 Ollama 是否使用 GPU：

```bash
# 发送请求后检查日志
journalctl -u ollama -f

# 应看到类似输出:
# "llama_model_loader: using CUDA for GPU acceleration"
```

### Docker GPU 配置（如 Ollama 运行在 Docker 中）

```bash
# 安装 NVIDIA Container Toolkit
# https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html

# 运行 Ollama with GPU
docker run -d --gpus all -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
```
