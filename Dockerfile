# MicroEra Wiki MVP — Docker 镜像
# Docling 不包含在镜像中（依赖链 ~500MB），文档导入由宿主机 Python 提供。

# ─── Stage 1: Build ──────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production

# ─── Stage 2: Runtime ────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/drizzle.config.ts ./

RUN mkdir -p /app/backend/data /app/backend/data/uploads

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/pipeline/health || exit 1

CMD ["npx", "tsx", "server/index.ts"]
