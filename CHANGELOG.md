# Changelog

本文件记录项目的所有重要变更。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased] - 2026-08-27

### Added

- **知识图谱探索器（PR #9）**
  - **关系类型端到端保留**：边不再扁平化为 `semantic_related`，`references` / `produces` / `belongs_to` / `derived_from` / `shared_tags` 透传并按类型着色；重建时 `relation.repository` 保留 `relationType` / `relationSource` 而非覆盖。
  - **边样式三维编码**：线色 = 关系类型、粗细/透明度 = 相似度、虚线样式 = 来源（实线 embedding / 虚线 tag / 点线 manual）；边 tooltip 显示关系名与来源，关系构成面板新增按来源拆分。
  - **全局 / 聚焦视图切换**：头部新增切换，`全局` 加载 `/api/graph/global`（截取 top-150 核心节点），`聚焦` 返回种子邻域；展开/搜索切回聚焦模式。
  - **诚实的数据状态**：后端不可用（mock 回退）显示「演示数据 · DEMO」徽章，否则「在线 · LIVE」；在线但图为空时显示空状态 +「去知识导入」CTA，而非静默展示演示数据。
  - **搜索消歧**：顶部搜索框标注「搜全库」，工具栏「筛当前」。

- **对象存储（MinIO）**：支持 MinIO 对象存储，附审计/迁移脚本与业务数据文档。
- **大文件存储（Git LFS）**：wiki 图片与 PDF 改用 Git LFS 存储。
- **跨文档关键词导航**：新增 `keywordLinker`，在条目正文中识别并链接其它知识条目关键词，实现跨文档跳转。
- **知识图谱搜索驱动探索器与语义关系持久化**：新增 `/api/graph/search` 与聚焦深度/限制参数；图谱页支持本地探索、节点展开、设置面板；新增 `entry_relations` 表（0006 迁移）持久化语义关系（0.45 阈值），图谱 API 改从该表读取而非每次搜索。
- **运行时日志系统**：新增运行时日志，并提供 admin 管理界面。
- **条目类型扩展**：支持新条目类型（asset / product / tech / patent / data_item），支持导入真实桌面数据。
- **书签 / 收藏（PR #4）**：实现真实的全栈书签/收藏功能。
  - 数据库新增 `bookmarks` 表（复合主键、外键级联删除）；新增 `BookmarkRepository`（add/remove/isBookmarked/findByUser）。
  - REST API：`GET / POST / DELETE /api/bookmarks`；前端新增 `bookmarksApi` 客户端模块。
  - 首页「我的收藏」、条目页与沙箱项目页的书签按钮由硬编码改为接入真实 API。
- **NUC 自动部署（MR !8）**：新增 NUC 服务器基于 GitLab 的轮询式自动部署。
  - `scripts/auto-deploy.sh`：拉取远端、检测新提交并自动部署（pull → install → build → restart）；脚本加载 NVM，保证 systemd 环境下 npm build 可用。
  - `auto-deploy.service`（oneshot）+ `auto-deploy.timer`（每 2 分钟触发一次）实现轮询。
  - `nuc-auto-deploy-setup.sh`：一键初始化（remote + SSH + timer）；附 NUC 部署文档。
- **Sandbox 连接器（DB 直连模式）**：初始 HTTP 连接器（auth/client/sync/markdown），后升级为 MySQL DB 直连——单 SQL JOIN 批量查询替代 N+1 爬取、启动自动同步、`connector_sync_log` 幂等去重、内容强制 internal + sandbox 标签。
- **文献检索（CrossRef / arXiv）**：完成 CrossRef 连接器（DOI 查询/关键词搜索/批量导入）与 arXiv 连接器（零依赖 Atom XML 解析）；新增文献搜索页（来源选择、可展开论文详情、一键导入、批量导入、导入历史）。
- **Feishu 连接器**：实现 Feishu 数据源接入（auth、client、markdown 转换、list/detail/sync）。
- **真实数据导入**：批量导入 PDF / DOCX / PPTX / XLSX；导入 284 条真实数据（124 tech、88 product、51 patent、19 asset、2 data_item）；DataItemPage / TemplateLibraryPage / BusinessValuePage 接入真实数据。
- **多轮 RAG 对话与详情页重构**：详情页改用 ViewModel 架构（MetadataCard/RecordCard/ReferenceView/ExpandableContent）；每条目多轮 RAG 聊天（ConversationPanel/MessageBubble/ChatInput + useConversation hook）；新增 `/api/admin/rebuild-embeddings`；新增 Dockerfile 与 Docker Compose 生产部署；Swagger 补全 Admin/Search/Graph 端点。
- **AI 检索问答（RAG）**：chunk 级检索与向量库去重；chunk 引用改用标题而非原始 chunk ID。
- **文档解析（Docling / pdf-parse / mammoth）**：集成 Docling CLI、pdf-parse、mammoth 解析 PDF / DOCX，文件上传读取真实内容。
- **PostgreSQL 持久化与 Repository 模式**：用 PostgreSQL + Repository Pattern 替换 JSON 文件存储，作为后端数据层基础。
- **Vercel 部署**：新增 serverless API 函数与 `vercel.json`；`start.ps1` 一键启动脚本。
- **基于当前文档询问 AI**: 实现文档内检索功能，entryId 从页面贯通到检索层；空文档提问时返回固定提示，不调用 LLM。

### Changed

- **颜色设计令牌全站迁移**：将散落在 45 个组件/页面中的 652 处硬编码品牌色统一收敛为设计令牌（design tokens），实现单一色板来源。纯视觉等价、无功能变化。
  - `src/index.css` 的 `@theme` 新增/规范化色板：主色 `brand`(#DB5F5B)、`ink`(#2B3150)、`accent`(#F2D760)、`link`(#1D70B8)，及各主色对应的 `-strong` / `-soft` 衍生色。
  - 新增中性色 `cream`(#F5F6E5)，替换原散落的 `#F5F6E5` 背景/高亮。
  - 硬编码色值替换为语义化令牌类名（如 `text-[#DB5F5B]` → `text-brand`、`bg-[#2B3150]` → `bg-ink`），透明度修饰符（`/10` 等）原样保留。
  - `#C04F4B`（珊瑚红 hover 变体）归并至 `brand-strong`。
  - `::selection` 选区样式改用 `var(--color-ink)` 与 `color-mix()`。
  - 保留字面量的场景（有意不改）：`@theme` 内 12 个令牌定义本身、canvas/G6/SVG 描边 8 处、`rgba(219,95,91,…)` 阴影光晕 9 处（CSS 变量在 canvas 中不生效）。

- **导入功能重命名**：导入统一更名为「知识导入」。
- **EntryType 规范**：`VALID_ENTRY_TYPES` 更新为新 schema，旧类型自动 fallback 映射。
- **路由迁移至 React Router v6（PR #2）**：用 React Router v6 替换 AppShell 中旧的 switch/case 页面管理，支持浏览器历史、URL 分享、深链接、后退导航与面包屑。
  - 新增 `src/router/index.tsx`（14 条路由 + 404）、`AppLayout` 统一布局、`ProtectedRoute` 鉴权守卫、`NotFoundPage`。
  - 15 个页面组件移除 `onNavigate` prop 改用 `useNavigate()`/`useParams()`；9 个共享组件改用 `Link`/`useNavigate`。
  - 受保护路由未登录跳转 `/login`，登录后跳回原目标页面；`App.tsx` 从 157 行精简到 8 行。
- **六大页面 UI 重设计（MR !9–!19）**：以「现代企业级 SaaS / AI 原生」视觉重设计首页、搜索、知识导入、AI 问答、文献搜索、条目详情六个页面，业务逻辑（API、路由、导航、数据源）全部保留。
  - **首页**：AI 搜索框作为视觉中心（珊瑚色聚焦光晕、Cmd/Ctrl+K、建议问题）；快捷统计行、快捷工作区 6 卡片、最近更新、书签，新增「知识洞察」统计瓦片与趋势话题；首页与公开首页两套重设计。
  - **搜索页**：居中大搜索框 + 最近/推荐搜索；筛选侧栏改为可折叠分组与 chip 式按钮、带实时计数徽章；结果卡片关键词高亮（`<mark>`）、骨架屏、空状态。
  - **知识导入页**：三步向导改为以 hero 上传区为中心的单页布局；拖拽视觉反馈、内联文件卡片、流水线阶段时间线、成功/失败独立结果态、最近上传侧栏。
  - **AI 问答页**：重命名为「MiQi AI Copilot Workspace」；全高聊天布局、思考过程时间线、引用来源 chips、追问建议、可折叠知识图谱侧栏、多行输入框。
  - **文献搜索页**：重命名为「AI 驱动的文献发现工作区」；arXiv/CrossRef 来源卡片、趋势研究主题、可展开论文卡片、导入评审弹窗与 6 阶段导入进度时间线。
  - **条目详情页**：统一 hero 头部、快捷操作工具栏（书签/复制链接/AI 问答）、粘性 TOC 侧栏、可折叠版本历史、右侧 AI 快捷操作 + 相关条目、悬浮 AI 助手面板；`ContentPaginator` 渲染优化（标题层级/代码块/表格/图片/引用块）。
- **时间戳统一北京时间**：所有时间戳转北京时间，搜索筛选接入 API。
- **Sandbox 精简**：移除 HTTP 模式，仅保留 DB 直连；清理相关废弃文件。
- **AI 模型切换**：AI 从本地 Ollama 切换为 DeepSeek API（Vercel demo）。

### Fixed

- **知识图谱性能**：`/api/graph/focused` 改用 SQL 有界 BFS（`findTouching` / `findWithin`），不再加载整张关系表；`/seed` 与 `/global` 有界拉取；外部访客在图中看不到内部条目。
- 修复知识图谱渲染、首页统计与重复条目问题。
- 搜索类型筛选展示全量知识库计数。
- 修复打开大 DOCX 时 UI 卡死，并恢复 DOCX 图片渲染。
- DOCX 嵌入图片改为提取为独立文件，而非丢弃。
- 修复 AI 问答页的自动滚动 / 滚动位置问题；知识图谱条目改为新标签页打开。
- 二进制文件上传改为 XHR 流式，避免内存缓冲。
- **Docling 解析错误报告（PR #4）**：失败时显示 stderr 尾部（真实错误）而非头部（INFO 日志）；剥离 ANSI 转义码；即使 Docling CLI 非零退出也尝试恢复输出文件。
- 修复 pdf-parse / mammoth 在 ESM 下的导入（createRequire、命名导出、降级 pdf-parse v1.1.1）。
- 修复 RAG 向量库去重 bug、SSE 流式协议不匹配与 chunk 持久化。
- 修复 Docling 标题元数据因 CRLF 丢失；CLI 安全文件名/格式提示/非致命错误；CLI 发现每 60s 重试。
- 修复长/损坏 UTF-8 标题破坏列表布局；Base64 data-URI 图片三重防御；误报「disconnected prematurely」日志。
- 修复 merge 丢失的 backend/main.ts、swagger 文档与 milvus 客户端。
- 修复 findMany() 返回类型变更、TagList `[object Object]`、AI 多轮 conversationId 丢失、SSE 缓存跨页、分页截断。
- 修复文献导入假成功与 entry_type 映射（preprint / academic_paper → tech）。
- **RAG 语义检索召回**: 移除按标题去重逻辑，补全类型白名单（7 种扩展至 12 种），修复排序按字母序而非相关性错乱的问题。
- **知识索引搜索框**: 同一文档出现多条重复结果，改为按 entry.id 去重，每个文档只显示一条。

### Maintenance

- 清理废弃的 `src/pages/KnowledgeGraphPage.tsx`（自 G6 探索器接管 `/graph` 与 `/knowledge-graph` 后未再使用）。
- 清理 `.gitignore` 中误提交的本机绝对路径；新增 test-results 忽略规则与图谱预览图。
- 清理 Sandbox HTTP 模式相关废弃文件（auth/client/sync/assets/detail/markdown）。
