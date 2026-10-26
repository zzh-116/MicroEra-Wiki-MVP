# MiqroEra Wiki P1-B 图片归属授权修复（方案 A）实施报告

- 日期：2026-10-13
- 范围：P1-B 图片所有权 / 访问授权（方案 A：独立 `document_images` 可信归属表）
- 状态：**阶段 1 代码与测试已完成**；解析→授权闭环**尚未接线**（见 §5 / §7）

---

## 1. 结论摘要

`/api/images/:name` 的授权来源已从「`documents.content` 子串匹配」彻底切换为独立的
`document_images` 可信归属表：

- 图片归属只能由**可信解析管道**写入 `document_images`（`registerImages`），
  `doc_update` 或编辑 Markdown **不能**建立访问权限。
- 访问时校验：有效 JWT + 图片归属 + 文档未软删 + 父 KB 未软删。
- 旧的 `knowledgeRepository.imageReferencedByAccessibleDocument`
  （`strpos(documents.content, '/api/images/<name>') > 0`）**已完全删除**，全仓库零引用。
- 图片文件名改为 **UUID 抗碰撞**，写入采用 **`wx` 防覆盖**（文件系统层），
  配合 DB 层 `UNIQUE(document_id, image_name)`（数据库层）双重保护。
- **尚未实现**：生产解析流程接入 `registerFromParse`（本轮按实施边界暂停，不虚构闭环）。

---

## 2. 新增 Schema、迁移与授权逻辑

### 2.1 表结构 `document_images`

| 列 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | `serial` | PRIMARY KEY | 自增主键 |
| `document_id` | `integer` | NOT NULL, FK→`documents(id)` ON DELETE CASCADE | 归属文档 |
| `image_name` | `text` | NOT NULL | UUID 文件名（单段、无路径） |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() | 登记时间 |

索引 / 约束：

- `UNIQUE(document_id, image_name)` —— DB 层防重复、防同文档同名冲突。
- `document_images_document_idx`（`document_id`）。
- `document_images_image_name_idx`（`image_name`，用于授权查询）。

### 2.2 迁移文件

`backend/db/migrations/0019_add_document_images.sql`（纯增量，不改现有数据）：

```sql
CREATE TABLE "document_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"image_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_document_id_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_document_id_image_name_unique"
  UNIQUE ("document_id","image_name");
--> statement-breakpoint
CREATE INDEX "document_images_document_idx" ON "document_images" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX "document_images_image_name_idx" ON "document_images" USING btree ("image_name");
```

### 2.3 Drizzle Schema

`backend/db/schema.ts` 新增 `documentImages`（列名/约束名与迁移完全一致，便于后续
`drizzle-kit generate` 不产生漂移）：

```ts
export const documentImages = pgTable(
  'document_images',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    imageName: text('image_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_images_document_id_image_name_unique').on(table.documentId, table.imageName),
    index('document_images_document_idx').on(table.documentId),
    index('document_images_image_name_idx').on(table.imageName),
  ],
);
```

### 2.4 归属仓库 `DocumentImageRepository`

`backend/repositories/document-image.repository.ts`：

- `registerImages(documentId, imageNames, tx?)` —— **唯一可信写入路径**，`onConflictDoNothing()`
  幂等，重试/重解析不会重复登记。
- `isImageAccessible(imageName)` —— 授权谓词（见 2.5）。
- `listByDocument` / `removeByDocument` / `allImageNames` —— 报告与清理辅助。

### 2.5 授权谓词（SQL 层）

```ts
async isImageAccessible(imageName: string): Promise<boolean> {
  const rows = await this.db
    .select({ id: documentImages.id })
    .from(documentImages)
    .innerJoin(documents, eq(documents.id, documentImages.documentId))
    .where(and(
      eq(documentImages.imageName, imageName),
      isNull(documents.deletedAt),          // 文档未软删
      this.parentKbActive(documents.kbId),  // 父 KB 未软删（EXISTS 关联）
    ))
    .limit(1);
  return rows.length > 0;
}
```

其中 `parentKbActive` 与知识域其他查询共用同一谓词：

```ts
exists(select({one: sql`1`}).from(knowledgeBases)
  .where(and(eq(knowledgeBases.id, kbId), isNull(knowledgeBases.deletedAt))))
```

### 2.6 路由 `server/routes/images.ts`

顺序：`requireAuth`（401）→ 文件名防穿越 `isValidImageName`（400）→
`documentImageRepository.isImageAccessible`（404）→ 文件存在性（404）→ 流式输出
（`Cache-Control: no-store`，无 ETag/Last-Modified/304 路径，P1-A 已落地）。

---

## 3. 修改文件清单及作用

### 新增

| 文件 | 作用 |
| --- | --- |
| `backend/db/migrations/0019_add_document_images.sql` | `document_images` 表 + FK + 唯一约束 + 索引 |
| `backend/repositories/document-image.repository.ts` | 可信写入 + SQL 授权谓词 + 清理/报告辅助 |
| `backend/services/document-image.service.ts` | `registerFromParse` / `rollbackDocumentImages`（失败清理）/ `orphanScan`（双向孤儿扫描，只读不删） |
| `scripts/report-historical-images.ts` | 只读历史图片计数报告（磁盘文件数 / 可信行数 / 可验证 / 不可验证 / 各类可编辑引用数），不输出正文或敏感内容 |
| `tests/helpers/apply-migrations.ts` | Postgres advisory lock 串行化并发测试库迁移（修复并发套件执行 0019 的竞态） |
| `tests/parity/document-images.test.ts` | 真实 SQL 归属验证（隔离库 `microera_wiki_test`） |
| `tests/parity/document-images-http.test.ts` | 真实 HTTP 矩阵（真实 Express app + 隔离库 + 临时 DATA_DIR） |
| `tests/parity/docling-images.test.ts` | 解析器 UUID 命名 / `wx` 防覆盖 / `savedImages` 上抛 |

### 修改

| 文件 | 变更 |
| --- | --- |
| `backend/db/schema.ts` | 新增 `documentImages` Drizzle 表 |
| `backend/parser/models.ts` | `ParseResult` 增加 `savedImages?: string[]` |
| `backend/parser/docling.ts` | UUID 文件名 + `{flag:'wx'}` 防覆盖 + 三处返回点上抛 `savedImages` + 导出 `newImageFileName`/`writeImageFile` |
| `server/routes/images.ts` | 授权切到 `documentImageRepository.isImageAccessible` |
| `backend/repositories/knowledge.repository.ts` | **删除** `imageReferencedByAccessibleDocument`（content 子串匹配授权，彻底移除） |
| `tests/routes/images.test.ts` | spy 从旧方法切到 `documentImageRepository.isImageAccessible` |
| `tests/parity/parse-job-db.test.ts` | 迁移段改用共享 `applyMigrations` |
| `tests/parity/knowledge-delete-isolation.test.ts` | 迁移段改用共享 `applyMigrations` |

---

## 4. 测试执行结果（真实）

`npx vitest run`（Postgres 5433 可用，DB 套件真实执行、非跳过）：

- **测试文件：52 通过（52）**
- **测试用例：542 通过（542）**，0 失败、0 跳过

typecheck：

- `tsc --noEmit`（lint）：干净
- `tsc --noEmit -p tsconfig.backend.json`：干净

覆盖矩阵（P1-B 相关）：

| 场景 | 结果 |
| --- | --- |
| 已登记 + 活跃文档 + 活跃 KB | 可访问（SQL true / HTTP 200） |
| 未登记文件名 | 拒绝（SQL false / HTTP 404） |
| **伪造 Markdown**（content 引用 `/api/images/<name>` 但未登记） | 拒绝（SQL false / HTTP 404）——旧 strpos 门已失效 |
| 已软删文档 | 拒绝（SQL false / HTTP 404） |
| 已软删 KB | 拒绝（SQL false / HTTP 404） |
| 匿名请求 | HTTP 401 |
| 穿越名 | HTTP 400 |
| 重复登记 | 幂等（listByDocument 仅 1 行） |
| DB 唯一约束 | 重复 (document_id, image_name) 触发 `23505` |
| 文件名 | UUID 命名、唯一 |
| 文件系统防覆盖 | 二次写同名抛 EEXIST，原字节不变 |
| `savedImages` 上抛 | `parseString` 返回并重写为 `/api/images/<uuid>` |
| 测试库运行时名称校验 | 各 DB 套件 `assertTestDatabase` 强制 `microera_wiki_test` |

---

## 5. 解析→授权闭环现状（诚实声明）

**当前并未实现「图片解析 → 授权访问」的完整闭环。** 本报告不宣称该闭环已完成。

核查结论：

- `backend/services/parse-job.service.ts` 实现了 durable 队列（enqueue/lease/heartbeat/
  checkpoint/complete/fail/deadletter），但 **server / cli 中没有任何地方调用 `lease()`
  并真正运行 Docling**；`lease('worker-*')` 仅出现在测试中。
- 生产解析路径是 legacy `import.service → docling → entries`（写 `entries`，不写 `documents`）。
- 因此当前**没有任何生产代码会自动写入 `document_images`**。

本轮改动把管道改成了「出处可登记」：

- 解析器已能产出 `savedImages`（UUID 文件名、防覆盖）；
- 仓库/服务已提供 `registerImages` / `registerFromParse` / 失败清理 / 孤儿扫描；
- 路由已严格按 `document_images` 授权。

但「谁在解析后调用 `registerFromParse`」这一接线步骤**按实施边界未执行**（见 §7）。

---

## 6. 迁移上线后的兼容性影响（fail-closed）

`0019` 迁移本身是纯增量建表，不改任何现有数据，可安全执行。

但授权语义切换带来的影响是 **fail-closed**：

- 授权现在只认 `document_images`；而历史上从未持久化过图片出处（解析器只写文件、
  不登记归属）。
- 因此迁移 + 接线上线后，**历史图片在 `/api/images` 下默认全部 404**，直到其所属文档
  被重新解析登记。
- 这是「不保留字符串匹配回退」的预期安全结果（无法验证来源的图片拒绝访问），
  但属于**功能性影响**（历史图片暂不可见），需通过 §7 的回填阶段恢复。

---

## 7. 后续实施阶段与风险

> 以下为**分阶段方案**，本轮均未执行；需另行决策与授权。

### 2a（最小接线）：legacy 解析路径登记

在 legacy `import.service` 解析成功后，若存在 `documents.entry_id` 对应的文档行，
调用 `documentImageService.registerFromParse(docId, result.savedImages)`。
覆盖「新上传走 legacy 管道」场景。

- 风险：需确认 entry→document 映射在目标环境可靠；legacy `entries` 与 `documents` 双轨
  并存，映射缺失的条目无法登记。

### 2b（推荐、较大）：实现 KB `parse_jobs` Worker

实现 worker：`lease(parse_jobs)` → 运行 Docling → 写 `documents.content` +
`document_images` + `knowledge_chunks` + `knowledge_vectors` + `document_elements`。
使新 KB 上传自动登记图片归属。

- 风险：涉及 Job/Worker 架构重构，明显超出本轮范围；需单独评审与测试。

### 2c（历史回填）：逐文档重解析 / 拒绝

对可验证原始解析产物（源字节仍在盘、可重新解析）的历史文档逐一重解析并登记
`document_images`；无法验证的按报告脚本结果拒绝访问，**不批量写入、不保留字符串匹配回退**。

- 风险：回填必须逐条可追溯，避免把可编辑引用误登记为可信归属。

---

## 8. 待确认事项（迁移 / 回滚 / 历史数据）

1. **迁移执行授权**：`0019` 尚未在任何开发或生产库执行；需在数据库身份核验通过、
   单独授权后进行。
2. **回滚方案**：`document_images` 为纯增量表，回滚即 `DROP TABLE document_images`
   （前提是尚未接入 `registerFromParse` 写入）。若已接入写入，回滚需同步下线写入方，
   否则新图片将无法授权。
3. **历史图片处置**：需在 2c 前用 `scripts/report-historical-images.ts`（只读）生成
   数量 / 可验证 / 不可验证 / 影响报告，作为回填与兼容性沟通依据。
4. **写入方唯一性**：接入 2a/2b 时须保证只有可信解析路径调用 `registerImages`，
   `doc_update` / 内容编辑永不调用。
5. **孤儿回收策略**：`orphanScan` 为只读；真正删除无主文件需另定宽限期与触发方式。

---

## 9. 边界与合规声明

- 本轮**未 commit、未 push**；Git 工作区保留全部改动供 Codex 复审。
- 本轮**未执行任何开发或生产数据库迁移**，未批量回填真实历史图片。
- 测试仅在经 `assertTestDatabase` 运行时名称核验的隔离测试库 `microera_wiki_test`
  （Postgres 5433）执行，并自我创建 / 自我清理种子数据。
- 本报告与全部代码**不包含、不记录 JWT、密码或敏感文档正文**。
- 未重构 Job/Worker，未进行其他 P2 大范围修改。
