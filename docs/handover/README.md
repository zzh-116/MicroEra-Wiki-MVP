# MicroEra Wiki MVP — Handover 文档

> **文档版本**: v1.0
> **生成日期**: 2026-07-14
> **目标读者**: Platform Team / DevOps / SRE（平台组）
> **项目移交方**: AI开发组 → 平台组

---

## 文档用途

本 Handover 文档为平台组提供完整的项目部署、运维和故障排查指南。
平台组无需参与代码开发，仅需根据本套文档完成环境搭建与服务维护。

## 推荐阅读顺序

| 序号 | 文档 | 说明 | 读者 |
|------|------|------|------|
| 1 | [01_Project_Overview](./01_Project_Overview.md) | 项目概览、技术栈、目录结构 | 全员 |
| 2 | [04_Server_Requirements](./04_Server_Requirements.md) | 硬件/软件需求 | Platform Lead |
| 3 | [02_System_Architecture](./02_System_Architecture.md) | 系统架构与数据流 | DevOps / SRE |
| 4 | [06_Environment_Variables](./06_Environment_Variables.md) | 所有环境变量说明 | DevOps |
| 5 | [03_Deployment_Guide](./03_Deployment_Guide.md) | 完整部署流程 | DevOps |
| 6 | [05_Docker_Deployment](./05_Docker_Deployment.md) | Docker 容器部署详情 | DevOps |
| 7 | [07_Model_Configuration](./07_Model_Configuration.md) | AI 模型配置与下载 | ML Ops / DevOps |
| 8 | [08_API_Documentation](./08_API_Documentation.md) | API 接口文档 | SRE / 集成方 |
| 9 | [09_Operation_Guide](./09_Operation_Guide.md) | 日常运维操作 | SRE |
| 10 | [10_Troubleshooting](./10_Troubleshooting.md) | 故障排查手册 | SRE / On-Call |

## 快速启动

如果你只需要快速把服务跑起来：

```bash
# 1. 安装前置依赖
#    - Node.js 22+
#    - Docker (用于 PostgreSQL + pgvector)
#    - Ollama (用于本地 LLM 和 Embedding)

# 2. 启动 PostgreSQL
docker compose up -d

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入必要的 API Key 和路径

# 4. 安装 Node 依赖
npm install

# 5. 下载 Embedding 模型
ollama pull bge-m3

# 6. (可选) 下载 LLM 模型
ollama pull qwen2.5:7b

# 7. 启动服务
npm run server

# 8. (可选) 启动前端开发服务器
npm run dev
```

## 项目关键信息

| 项目 | 详情 |
|------|------|
| 项目名称 | MicroEra Wiki MVP |
| 服务端口 | `3001`（API），`3000`（前端 dev） |
| 数据库 | PostgreSQL 16 + pgvector |
| 向量维度 | 1024 |
| LLM Provider | Ollama（本地）或 DeepSeek（云端） |
| Embedding Model | `bge-m3`（via Ollama） |
| 文档解析器 | Docling（Python CLI） |
| 认证方式 | JWT (HS256) |
| 前端框架 | React 19 + Vite + Tailwind CSS 4 |
| 后端框架 | Express.js (TypeScript) |
| ORM | Drizzle ORM |

## 常见缩写

| 缩写 | 全称 |
|------|------|
| RAG | Retrieval-Augmented Generation（检索增强生成） |
| SSE | Server-Sent Events（服务端推送事件） |
| pgvector | PostgreSQL 向量扩展 |
| Milvus | 分布式向量数据库（本项目可选） |
| Ollama | 本地 LLM 运行时 |
| bge-m3 | BAAI General Embedding Model v3 |
| LLM | Large Language Model（大语言模型） |
| JWT | JSON Web Token |
