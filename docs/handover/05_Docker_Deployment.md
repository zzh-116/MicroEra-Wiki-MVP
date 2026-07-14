# 05 — Docker 部署 (Docker Deployment)

> **目标读者**: DevOps
> **阅读时间**: 10 分钟

---

## 5.1 容器概览

当前项目使用 **1 个 Docker 容器**（docker-compose.yml）：

| 容器名 | 镜像 | 必选？ | 说明 |
|--------|------|--------|------|
| `microera-postgres` | `pgvector/pgvector:pg16` | ✅ 是 | PostgreSQL 16 + pgvector 扩展 |

### 未容器化的服务（当前）

以下服务**尚未 Docker 化**，需要在宿主机直接运行：

| 服务 | 说明 | Docker 化优先级 |
|------|------|----------------|
| Express API (Node.js) | `npm run server` | 高 |
| Ollama | LLM + Embedding 服务 | 中（Ollama 有官方 Docker 镜像） |
| Docling (Python) | 文档解析 | 低（按需调用） |

> **TODO**: 项目的 Dockerfile 尚未创建。Express API 和 Ollama 的 Docker 化是平台组的优先工作项。

---

## 5.2 docker-compose.yml 详解

```yaml
version: '3.8'

services:
  postgres:
    image: pgvector/pgvector:pg16  # PostgreSQL 16 + pgvector
    container_name: microera-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres        # ⚠️ 生产环境必须修改
      POSTGRES_DB: microera_wiki
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data  # 持久化数据库数据
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:  # 命名数据卷
```

---

## 5.3 容器依赖关系

```
microera-postgres (PostgreSQL)
        │
        ├── 依赖: 无（独立启动）
        │
        └── 被依赖:
            ├── Express API (Node.js) — 数据库连接
            ├── Drizzle ORM 迁移 — 表结构管理
            └── Seed 脚本 — 初始数据导入
```

**启动顺序**: PostgreSQL 必须先启动，等待健康检查通过后，再启动 Express。

---

## 5.4 网络

当前 docker-compose 使用 Docker 默认网络（bridge）：
- PostgreSQL 端口 `5432` 映射到宿主机 `localhost:5432`
- Express 直接通过 `localhost:5432` 连接（非容器内 DNS）

**若将 Express 也容器化**，建议使用自定义 Docker 网络：

```yaml
networks:
  microera-net:
    driver: bridge

services:
  postgres:
    networks:
      - microera-net
    # 可以移除 ports 暴露（仅容器间通信）

  express:
    networks:
      - microera-net
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/microera_wiki
    ports:
      - '3001:3001'
```

---

## 5.5 Volume（数据卷）

| Volume 名称 | 容器内路径 | 持久化内容 | 备份策略 |
|-------------|-----------|-----------|---------|
| `pgdata` | `/var/lib/postgresql/data` | 所有数据库数据（条目、分块、向量、用户） | `pg_dump` 定期备份 |

查看 Volume 详情：

```bash
docker volume inspect microera-wiki-mvp_pgdata
```

---

## 5.6 启动与管理

### 基本操作

```bash
# 启动
docker compose up -d

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f postgres

# 停止
docker compose down

# 停止并删除数据卷（⚠️ 危险！）
docker compose down -v
```

### 数据库连接

```bash
# 进入 PostgreSQL CLI
docker exec -it microera-postgres psql -U postgres -d microera_wiki

# 查看表
\dt

# 查看条目数量
SELECT count(*) FROM entries;

# 查看向量数量
SELECT count(*) FROM vectors;

# 查看 pgvector 扩展版本
SELECT * FROM pg_extension WHERE extname='vector';

# 退出
\q
```

### 手动备份

```bash
# 导出完整数据库
docker exec microera-postgres pg_dump -U postgres microera_wiki > backup_$(date +%Y%m%d).sql

# 恢复
docker exec -i microera-postgres psql -U postgres -d microera_wiki < backup_20260714.sql
```

---

## 5.7 生产环境建议

### 1. 修改默认密码

当前 docker-compose.yml 使用 `postgres/postgres` 的默认凭据。
生产环境必须修改：

```yaml
environment:
  POSTGRES_USER: microera_prod
  POSTGRES_PASSWORD: <强随机密码>
  POSTGRES_DB: microera_wiki
```

同步更新 `.env` 中的 `DATABASE_URL`。

### 2. 限制资源

```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
```

### 3. 自定义 pgvector 配置

```yaml
services:
  postgres:
    command: >
      postgres
      -c shared_buffers=2GB
      -c work_mem=64MB
      -c maintenance_work_mem=512MB
      -c effective_cache_size=6GB
      -c max_connections=100
```

### 4. 日志轮转

```yaml
services:
  postgres:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 5.8 未来 Docker 化路线图

以下组件建议逐步容器化：

| 优先级 | 组件 | Docker 化方案 | 工作量 |
|--------|------|-------------|--------|
| P0 | Express API | 编写 Dockerfile，加入 docker-compose | 小 |
| P1 | Ollama | 使用官方 `ollama/ollama` 镜像 | 小 |
| P2 | 全栈编排 | docker-compose 编排所有服务 | 中 |
| P3 | Docling | 封装为独立 API 容器 | 中 |

### 建议的完整 docker-compose 结构（未来）

```yaml
services:
  postgres:    # pgvector/pgvector:pg16
  ollama:      # ollama/ollama (with GPU)
  express:     # 自定义 Dockerfile (Node.js)
  # docling:   # 自定义（Python + Docling API）
  # nginx:     # nginx:alpine (反向代理)
```
