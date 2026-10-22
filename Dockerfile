# MicroEra Wiki MVP — Docker 镜像
# 把 Docling 打包进容器，避免依赖宿主机环境

# ─── Stage 1: Build ──────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production

# ─── Stage 2: Runtime ────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

# 安装 Python、pip 和 Docling
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip install docling --break-system-packages --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/server ./server
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/drizzle.config.ts ./

RUN mkdir -p /app/backend/data /app/backend/data/uploads

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/pipeline/health || exit 1

CMD ["npx", "tsx", "server/index.ts"]
