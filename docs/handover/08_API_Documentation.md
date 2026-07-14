# 08 — API 文档 (API Documentation)

> **目标读者**: SRE / 集成方
> **阅读时间**: 20 分钟

---

## 8.1 通用说明

### Base URL

```
开发环境: http://localhost:3001/api
生产环境: https://<your-domain>/api
```

### 认证

| 方式 | Header | 说明 |
|------|--------|------|
| JWT Bearer Token | `Authorization: Bearer <token>` | 登录后获取，有效期 24 小时 |
| 无认证（游客） | 无 | 部分接口允许未登录访问（仅 public 数据） |

### 通用错误码

| HTTP 状态码 | 含义 |
|-------------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证或 Token 过期 |
| 403 | 权限不足（尝试访问 internal 数据） |
| 404 | 资源不存在 |
| 422 | 请求格式正确但业务逻辑错误 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用（AI 服务、搜索服务等） |

### 通用响应格式

```json
// 成功
{ "id": 1, "title": "...", ... }

// 失败
{ "error": "ERROR_CODE", "message": "中文错误描述" }
```

---

## 8.2 API 列表

### Auth — 认证

#### `POST /api/auth/login`

登录获取 JWT Token。

- **Method**: `POST`
- **Auth**: 无

**Request Body**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response** (200):
```json
{
  "token": "eyJ...",
  "user": { "id": 1, "username": "admin", "displayName": "管理员", "role": "admin" }
}
```

**Response** (401):
```json
{ "error": "INVALID_CREDENTIALS", "message": "用户名或密码错误" }
```

---

#### `GET /api/auth/me`

获取当前用户信息。

- **Method**: `GET`
- **Auth**: Bearer Token

**Response** (200):
```json
{
  "userId": 1, "username": "admin", "role": "admin",
  "displayName": "管理员", "lastLoginAt": "2026-07-14T..."
}
```

---

### Entries — 知识条目

#### `GET /api/entries`

获取条目列表。无分页参数时返回全部条目。

- **Method**: `GET`
- **Auth**: Optional（未登录仅返回 public 条目）

**Query Parameters**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `keyword` | string | 否 | 关键词搜索（标题/摘要/内容） |
| `entry_type` | string | 否 | 类型: `asset`, `product`, `tech`, `patent`, `data_item` |
| `visibility` | string | 否 | 可见度: `public`, `internal` |
| `category_id` | string | 否 | 分类 ID |
| `tag` | string | 否 | 标签名 |
| `page` | number | 否 | 页码（启用分页） |
| `pageSize` | number | 否 | 每页条数（启用分页，默认 10，最大 100） |

**Response** (200):
```json
[
  {
    "id": 1,
    "title": "量子计算材料设计平台",
    "entry_type": "product",
    "summary": "...",
    "content": "...",
    "visibility": "public",
    "category_id": 2,
    "created_at": "2026-06-10T01:20:00.000Z",
    "updated_at": "2026-06-22T09:10:00.000Z",
    "tags": ["产品介绍", "材料计算"]
  }
]
```

> 带分页参数时返回: `{ "entries": [...], "total": 100, "page": 1, "pageSize": 10, "totalPages": 10 }`

---

#### `GET /api/entries/:id`

获取单个条目详情。

- **Method**: `GET`
- **Auth**: Optional

**Response** (200): 单个 Entry 对象

**Response** (403):
```json
{ "error": "UNAUTHORIZED_INTERNAL_VIEW", "message": "无权查看内部条目" }
```

**Response** (404):
```json
{ "error": "ENTRY_NOT_FOUND", "message": "条目不存在" }
```

---

#### `POST /api/entries`

创建新条目。

- **Method**: `POST`
- **Auth**: Bearer Token（requireAuth）

**Request Body**:
```json
{
  "title": "新条目标题",
  "entry_type": "tech",
  "summary": "摘要",
  "content": "正文 Markdown 内容",
  "visibility": "internal",
  "category_id": 3,
  "tags": ["AI", "技术"]
}
```

**Response** (201): 创建的 Entry 对象

---

#### `PUT /api/entries/:id`

更新条目。

- **Method**: `PUT`
- **Auth**: Bearer Token（requireAuth）

**Request Body**: 部分字段（仅传需要更新的字段）

**Response** (200): 更新后的 Entry 对象

---

#### `DELETE /api/entries/:id`

软删除条目（设置 deleted_at）。

- **Method**: `DELETE`
- **Auth**: Bearer Token（requireAuth）

**Response** (200):
```json
{ "success": true }
```

---

### Search — 搜索

#### `POST /api/search`

语义搜索（带查询时）或数据库查询（无查询时）。

- **Method**: `POST`
- **Auth**: Optional

**Request Body** (有查询 — 语义搜索):
```json
{
  "query": "量子计算纠错算法",
  "type": "product"
}
```

**Response** (200):
```json
{
  "results": [
    {
      "id": 226,
      "title": "IPM-100",
      "summary": "...",
      "entry_type": "product",
      "visibility": "internal",
      "tags": ["材料计算"],
      "updated_at": "...",
      "owner": "",
      "matchReason": "语义搜索匹配",
      "referenceSource": "semantic"
    }
  ],
  "source": "semantic"
}
```

**Request Body** (无查询 — 数据库列表):
```json
{
  "type": "tech",
  "page": 1,
  "pageSize": 10
}
```

**Response** (200):
```json
{
  "results": [...],
  "page": 1,
  "pageSize": 10,
  "total": 50,
  "totalPages": 5,
  "source": "database"
}
```

---

### AI — 智能问答

#### `POST /api/ai/chat`

非流式 RAG 问答。

- **Method**: `POST`
- **Auth**: Optional（对话历史需登录）

**Request Body**:
```json
{
  "question": "什么是稳定子算法？",
  "conversationId": 0
}
```

**Response** (200):
```json
{
  "answer": "稳定子算法是...",
  "sources": [
    { "id": 226, "title": "IPM-100", "entry_type": "product" }
  ],
  "conversationId": 1
}
```

---

#### `POST /api/ai/chat/stream`

流式 SSE RAG 问答。

- **Method**: `POST`
- **Auth**: Optional
- **Content-Type**: `text/event-stream`（SSE 响应）

**Request Body**: 同 `/api/ai/chat`

**SSE Events**:
```
event: start
data: {"type":"start","conversationId":1}

event: token
data: {"type":"token","content":"稳定"}

event: token
data: {"type":"token","content":"子"}

...

event: done
data: {"type":"done","sources":[...],"conversationId":1}
```

---

#### `POST /api/ai/summarize`

AI 摘要生成。

- **Method**: `POST`
- **Auth**: 无

**Request Body**:
```json
{ "entryId": 226 }
```

**Response** (200):
```json
{ "summary": "该条目描述了..." }
```

---

### Pipeline — 数据管道

#### `GET /api/pipeline/health`

健康检查。

- **Method**: `GET`
- **Auth**: 无

**Response** (200):
```json
{
  "status": "ok",
  "pipeline": {
    "ollama": "http://localhost:11434",
    "chatModel": "qwen2.5:7b",
    "embeddingModel": "bge-m3",
    "vectorStore": "pgvector",
    "database": "connected"
  },
  "supportedFormats": [...],
  "timestamp": "2026-07-14T..."
}
```

---

#### `GET /api/pipeline/status`

管道状态和数据统计。

- **Method**: `GET`
- **Auth**: 无

---

#### `GET /api/pipeline/formats`

获取支持的文档格式。

- **Method**: `GET`
- **Auth**: 无

---

#### `POST /api/pipeline/parse`

解析文档（返回 Markdown + 属性）。

- **Method**: `POST`
- **Auth**: 无

**Request Body**:
```json
{
  "content": "# Markdown 内容...",
  "fileName": "test.md"
}
```

---

#### `POST /api/pipeline/chunk`

文档分块。

- **Method**: `POST`
- **Auth**: 无

**Request Body**:
```json
{
  "text": "长文本...",
  "strategy": "markdown",
  "chunkSize": 1024,
  "overlap": 128
}
```

---

#### `POST /api/pipeline/embed`

文本向量化。

- **Method**: `POST`
- **Auth**: 无

**Request Body**:
```json
{
  "texts": ["文本1", "文本2"],
  "entryId": 1
}
```

---

#### `POST /api/pipeline/import`

导入文档（完整管道：解析→分块→嵌入→存储）。

- **Method**: `POST`
- **Auth**: 无
- **Content-Type**: `multipart/form-data` 或 `application/json`

**文件上传** (multipart):
```
field: file (文件)
field: metadata (JSON string, 可选)
```

**JSON 提交**:
```json
{
  "filePath": "/data/documents/paper.pdf",
  "metadata": { "title": "论文标题", "entry_type": "tech" }
}
```

---

#### `POST /api/pipeline/import/string`

从字符串导入。

- **Method**: `POST`
- **Auth**: 无

```json
{
  "content": "# Markdown 内容...",
  "fileName": "import.md",
  "metadata": { "title": "导入标题" }
}
```

---

#### `POST /api/pipeline/import/batch`

批量导入目录。

- **Method**: `POST`
- **Auth**: 无

```json
{
  "dirPath": "/data/documents/",
  "pattern": "*.pdf"
}
```

---

#### `POST /api/pipeline/search`

管道语义搜索（同 Search 服务，格式略有不同）。

- **Method**: `POST`
- **Auth**: 无

```json
{
  "query": "MOF材料",
  "topK": 10,
  "isInternal": true
}
```

---

### Graph — 知识图谱

#### `GET /api/graph/global`

获取全量知识图谱数据。

- **Method**: `GET`
- **Auth**: Optional

**Response** (200):
```json
{
  "nodes": [{ "id": "gn-1", "label": "条目名", "type": "product", "entryId": "1", "description": "..." }],
  "edges": [{ "id": "ge-1-2", "source": "gn-1", "target": "gn-2", "relation": "shared_tags", "description": "共享标签: AI, 材料计算" }]
}
```

---

#### `GET /api/graph/focused?entryId=1`

获取以某个条目为中心的子图。

- **Method**: `GET`
- **Auth**: Optional

---

### Files — 文件管理

#### `GET /api/files`

获取文件列表。

- **Method**: `GET`
- **Auth**: Optional

---

#### `GET /api/files/:id`

获取文件详情。

- **Method**: `GET`
- **Auth**: Optional

---

### Tags — 标签管理

#### `GET /api/tags`

获取所有标签。

- **Method**: `GET`
- **Auth**: Optional

---

### Categories — 分类管理

#### `GET /api/categories`

获取所有分类。

- **Method**: `GET`
- **Auth**: Optional

---

### Connectors — 外部连接器

#### `GET /api/connectors`

获取可用连接器列表。

- **Method**: `GET`
- **Auth**: Bearer Token（requireAuth）

---

#### `POST /api/connectors/:name/sync`

触发连接器同步。

- **Method**: `POST`
- **Auth**: Bearer Token（requireAuth）

---

### Spaces — 知识空间

#### `GET /api/spaces`

获取知识空间（分类）列表。

- **Method**: `GET`
- **Auth**: Optional

---

## 8.3 Swagger 文档

项目包含 Swagger UI（如 `backend/swagger/` 目录存在）：

```
http://localhost:3001/api/docs
```

> **TODO**: Swagger spec 文件（`backend/swagger/`）未在仓库中找到。
> 如果需要 OpenAPI 规范，建议平台组基于本文档和路由定义生成。
