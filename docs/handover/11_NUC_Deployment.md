# 11 — NUC 服务器部署方案 (NUC Deployment Guide)

> **目标读者**: DevOps / SRE
> **阅读时间**: 20 分钟
> **目标机器**: Intel NUC @ 192.168.40.60

---

## 11.1 服务器资源规划

### 硬件配置

| 磁盘 | 容量 | 类型 | 挂载点 | 用途 |
|------|------|------|--------|------|
| nvme0n1p1 | ~30G | NVMe SSD | `/` | 操作系统 |
| nvme0n1p3 | 92G | NVMe SSD | `/data/dataset-temp` | 模型缓存、临时数据 |
| nvme0n1p4 | 59G | NVMe SSD | `/data/code-project` | **Wiki MVP 源码** |
| nvme0n1p5 | 308G | NVMe SSD | `/data/archive-hot` | 热数据、Ollama 模型存储 |
| nvme1n1p1 | 931G | NVMe SSD | `/data/docker` | **Docker 容器 + PostgreSQL 数据** |
| sda1 | 916G | HDD | `/mnt/backup` | 数据库备份、冷归档 |

### 服务端口规划

| 端口 | 服务 |
|------|------|
| 3001 | MicroEra Wiki MVP (Express API + 前端 SPA) |
| 5432 | PostgreSQL (Docker) |
| 11434 | Ollama API |

### 磁盘用量估算

| 组件 | 预计占用 | 位置 |
|------|---------|------|
| Wiki MVP 源码 | ~50 MB | `/data/code-project/microera-wiki` |
| Node.js + node_modules | ~500 MB | 同上 |
| PostgreSQL 数据 | 初始 100MB，随使用增长 | `/data/docker/volumes/postgres` |
| Ollama 模型 (bge-m3 + qwen2.5:7b) | ~7 GB | `/data/archive-hot/ollama` |
| Docker 镜像 | ~1 GB | `/data/docker` |
| 上传文件 + 解析产物 | 按需增长 | `/data/code-project/microera-wiki/backend/data` |

---

## 11.2 部署步骤

### Step 1 — SSH 登录服务器

```bash
ssh devops@192.168.40.60
# 密码见 NUC.txt
```

### Step 2 — 安装基础依赖

```bash
# Node.js 22+ (通过 nvm 管理版本)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node --version   # 应 ≥ 22.0

# Git
sudo apt-get update && sudo apt-get install -y git

# Docker (如未安装)
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker devops
# 重新登录使 docker 权限生效
```

### Step 3 — 拉取代码

```bash
cd /data/code-project
git clone https://github.com/zzh-116/MicroEra-Wiki-MVP.git microera-wiki
cd microera-wiki
git checkout main
npm install
```

### Step 4 — 配置 Docker 数据目录

编辑 `/etc/docker/daemon.json`（需 sudo），将 Docker 数据目录指向 NVMe 数据盘：

```json
{
  "data-root": "/data/docker",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

重启 Docker：

```bash
sudo systemctl restart docker
docker info | grep "Docker Root Dir"  # 确认路径
```

### Step 5 — 启动 PostgreSQL

项目自带 `docker-compose.yml`，使用之前先把 volumes 指向 NVMe 盘：

```bash
cd /data/code-project/microera-wiki

# 创建 pgvector 数据目录在高速 NVMe 盘上
mkdir -p /data/docker/volumes/postgres

# 启动 PostgreSQL（仅数据库，不含 app 容器）
docker compose up -d postgres
```

### Step 6 — 配置 Ollama

#### 方案 A：NUC 有 GPU（推荐，速度快）

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 修改模型存储路径到高速 NVMe 盘
sudo systemctl edit ollama.service
# 添加:
# [Service]
# Environment="OLLAMA_MODELS=/data/archive-hot/ollama"

sudo systemctl restart ollama

# 拉取模型
ollama pull bge-m3          # 嵌入模型，~2GB
ollama pull qwen2.5:7b      # 对话模型，~4.7GB
```

#### 方案 B：NUC 无 GPU / 显存不足（用云端 API）

如果 NUC 没有独立显卡或显存不足运行 LLM，可跳过 Ollama 的对话模型安装，改用 DeepSeek 云端 API。

> Ollama 嵌入模型 (bge-m3) 仍建议本地安装，CPU 模式也可运行。

### Step 7 — 配置环境变量

```bash
cd /data/code-project/microera-wiki
cp .env.example .env
```

编辑 `.env`：

```env
# Server
PORT=3001
JWT_SECRET=<生成一个随机字符串: openssl rand -hex 32>

# LLM Provider — 根据 NUC 是否有 GPU 选择
LLM_PROVIDER=ollama              # 有 GPU 用 ollama，无 GPU 用 deepseek
OLLAMA_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=qwen2.5:7b
OLLAMA_EMBED_MODEL=bge-m3

# DeepSeek（如果 LLM_PROVIDER=deepseek）
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_CHAT_MODEL=deepseek-v4-flash

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/microera_wiki

# Data directory（放在 NVMe 盘）
DATA_DIR=/data/archive-hot/wiki-data

# Embedding
EMBEDDING_DIM=1024
```

### Step 8 — 初始化数据库

```bash
# 首次启动会自动 migrate + seed
npm run backend
# 看到 "[Bootstrap] PostgreSQL ready" 后 Ctrl+C 退出
```

### Step 9 — 构建前端

```bash
npm run build
# 产物在 dist/ 目录
```

### Step 10 — 启动生产服务

**方式 1：直接启动（前台测试）**

```bash
npm run server
# 访问 http://192.168.40.60:3001
```

**方式 2：systemd 服务（推荐，后台自启动）**

创建 `/etc/systemd/system/microera-wiki.service`（需 sudo）：

```ini
[Unit]
Description=MicroEra Wiki MVP
After=network.target docker.service

[Service]
Type=simple
User=devops
WorkingDirectory=/data/code-project/microera-wiki
ExecStart=/home/devops/.nvm/versions/node/v22.0.0/bin/node \
  /data/code-project/microera-wiki/node_modules/.bin/tsx \
  server/index.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable microera-wiki
sudo systemctl start microera-wiki
sudo systemctl status microera-wiki
```

### Step 11 — 验证部署

```bash
# 健康检查
curl http://localhost:3001/api/pipeline/health

# 连接器列表（应显示 4 个）
curl http://localhost:3001/api/connectors

# 测试文献搜索
curl "http://localhost:3001/api/connectors/arxiv/documents?keyword=quantum"

# 访问前端
# 浏览器打开: http://192.168.40.60:3001
```

---

## 11.3 数据备份策略

### 数据库备份（定时任务）

```bash
# 创建备份脚本
cat > /data/code-project/microera-wiki/scripts/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/mnt/backup/wiki-db"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M%S)
docker exec microera-wiki-postgres-1 pg_dump -U postgres microera_wiki \
  | gzip > "$BACKUP_DIR/wiki_$DATE.sql.gz"
# 保留最近 30 天
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "[$(date)] Backup done: wiki_$DATE.sql.gz"
EOF

chmod +x /data/code-project/microera-wiki/scripts/backup-db.sh
```

添加 crontab（每天凌晨 2 点）：

```bash
crontab -e
# 添加:
0 2 * * * /data/code-project/microera-wiki/scripts/backup-db.sh >> /mnt/backup/wiki-db/backup.log 2>&1
```

### 文件备份

```bash
# 上传文件 + 解析产物备份（每周日）
0 3 * * 0 tar -czf /mnt/backup/wiki-files/wiki_data_$(date +%Y%m%d).tar.gz \
  /data/archive-hot/wiki-data && \
  find /mnt/backup/wiki-files -name "*.tar.gz" -mtime +60 -delete
```

---

## 11.4 运维命令速查

| 操作 | 命令 |
|------|------|
| 查看服务状态 | `sudo systemctl status microera-wiki` |
| 重启服务 | `sudo systemctl restart microera-wiki` |
| 查看日志 | `sudo journalctl -u microera-wiki -f` |
| 查看磁盘 | `df -h` |
| 查看 Docker | `docker ps` |
| 数据库备份 | `/data/code-project/microera-wiki/scripts/backup-db.sh` |
| 更新代码 | `cd /data/code-project/microera-wiki && git pull && npm install && npm run build && sudo systemctl restart microera-wiki` |
| 重建 Embedding | `curl -X POST http://localhost:3001/api/admin/rebuild-embeddings` |

---

## 11.5 外部访问（如需要）

NUC 当前 IP 为 `192.168.40.60`（局域网地址）。如需外网访问：

1. **路由器端口转发**：将 WAN 端口 3001 转发到 `192.168.40.60:3001`
2. **Nginx 反向代理**（推荐）：

```nginx
server {
    listen 80;
    server_name wiki.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;  # SSE 长连接
    }
}
```

---

## 11.6 快速一键部署脚本

```bash
#!/bin/bash
# deploy-nuc.sh — MicroEra Wiki MVP NUC 一键部署
set -e

echo "=== MicroEra Wiki MVP NUC Deployment ==="

cd /data/code-project
if [ ! -d microera-wiki ]; then
  git clone https://github.com/zzh-116/MicroEra-Wiki-MVP.git microera-wiki
fi

cd microera-wiki
git pull origin main
npm install

# 环境变量检查
if [ ! -f .env ]; then
  cp .env.example .env
  echo ">> 请编辑 /data/code-project/microera-wiki/.env 后重新运行"
  exit 1
fi

# Docker PostgreSQL
mkdir -p /data/docker/volumes/postgres
docker compose up -d postgres
sleep 3

# 数据库初始化
npm run backend &
sleep 10
pkill -f "tsx backend/main.ts" || true

# 构建前端
npm run build

# 重启生产服务
sudo systemctl restart microera-wiki || echo ">> systemd 服务未配置，手动启动: npm run server"

echo "=== 部署完成 ==="
echo "访问: http://192.168.40.60:3001"
```
