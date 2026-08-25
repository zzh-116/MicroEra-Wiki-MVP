# PDF 随项目保存：Git LFS 方案设计（只读评估）

生成时间：2026-08-14
状态：仅设计，未执行任何 Git push、数据库写入、UCL 操作。

## 1. 现状检查

### 1.1 PDF 数量与大小

| 目录 | PDF 数 | 大小 |
| --- | ---: | ---: |
| `backend/data/reports` | 1 | 62.70 MB |
| `backend/data/zaozhi` | 180 | 839.25 MB |
| `backend/data/laiguanxue` | 4 | 6.20 MB |
| 合计 | 185 | 866.08 MB |

唯一 SHA256 为 176，其中有 9 组重复内容。Git LFS 按内容哈希去重，重复文件实际只存一份 LFS 对象。

### 1.2 GitLab / Git LFS 当前配置

- 本地已安装 `git-lfs/3.7.1`，Git LFS filter 已全局配置。
- 当前仓库没有 `.gitattributes`，也没有 `.lfsconfig`。
- GitLab remote：`ssh://git@git.miqroera.com:12222/intership/microera-wiki-mvp.git`
- `git lfs env` 已检测到 GitLab LFS endpoint：
  `https://git.miqroera.com/intership/microera-wiki-mvp.git/info/lfs`
- 尚未确认 GitLab 项目设置里是否已启用 LFS，push 前需要确认。

### 1.3 `.gitignore` 当前状态

`.gitignore` 当前明确忽略：

```text
backend/data/reports/
backend/data/zaozhi/
backend/data/laiguanxue/
```

`git check-ignore` 已确认 PDF 全部处于未跟踪、被忽略状态。`git ls-files backend/data` 只有 7 个 metadata 文件，没有任何 PDF。

### 1.4 部署链路

- `Dockerfile` builder 使用 `COPY . .`，runtime 会 `COPY /app/backend`，所以只要 PDF 被 Git 跟踪并真实检出，镜像就能带上。
- `.dockerignore` 没有排除 `backend/data/reports|zaozhi|laiguanxue`，只排除了 `backend/data/uploads/*`。
- 关键问题：`docker-compose.yml` 挂了 `app-data:/app/backend/data` 命名卷。即使镜像里有 PDF，这个卷也会覆盖整个 `backend/data`，容器内看不到镜像里的 PDF。
- 未发现 `.gitlab-ci.yml` 或 UCL 部署脚本；UCL 目前看起来是手动 Docker 构建/部署。
- Vercel 配置只负责前端静态站，不适合承载 866 MB 本地 PDF。

### 1.5 Wiki 当前如何读取 PDF

- 后端导入/解析路径：`server/routes/pipeline.ts` 接收 `filePath`，调用 `parser.parseFile(filePath)`，直接读服务器本地文件。
- 导入脚本（`scripts/import-real-data.ts` 等）扫描 `backend/data`，也是直接按本地路径读取。
- 前端 `SourceFileList.tsx` 的下载目前是 mock，`storagePath` 只是展示文本。
- `GET /api/files` 只返回 `wiki_files` 元数据；当前没有任何从本地磁盘下载 PDF 的正式路由。
- 上一轮新增的 `GET /api/files/:id/download` 是 MinIO 代理，不适用于 Git LFS 方案。

## 2. 结论

MinIO/对象存储不是必需项。Git LFS 可以满足四个需求，但必须同时满足以下条件：

1. PDF 通过 Git LFS 跟踪并推送到 GitLab；
2. 换电脑 clone 后执行 `git lfs pull`，PDF 以真实文件存在；
3. Docker 镜像包含 `backend/data` 中的 PDF；
4. 移除 `app-data:/app/backend/data` 对整个 data 目录的覆盖，或只对运行时子目录挂卷；
5. Wiki 通过相对路径 + 本地文件读取/下载 PDF，不依赖 object key。

## 3. 推荐方案

### 3.1 让 PDF 进入 Git LFS

修改 `.gitignore`，删除这三行：

```text
backend/data/reports/
backend/data/zaozhi/
backend/data/laiguanxue/
```

新增 `.gitattributes`：

```text
backend/data/**/*.pdf filter=lfs diff=lfs merge=lfs -text
```

等价命令（后续执行）：

```bash
git lfs track "backend/data/**/*.pdf"
```

可选 `.lfsconfig`，指向 GitLab LFS endpoint：

```toml
[lfs]
  url = https://git.miqroera.com/intership/microera-wiki-mvp.git/info/lfs
```

push 前需确认 GitLab 项目已开启 LFS，并验证 SSH/HTTPS 凭据可用。

### 3.2 Docker 镜像与 UCL 部署

- 保留 `Dockerfile` 的 `COPY . .`，让 `backend/data` 进入 build context。
- `.dockerignore` 保持不排除 `backend/data/reports|zaozhi|laiguanxue`。
- `docker-compose.yml` 改为只挂运行时子目录：

```yaml
volumes:
  - app-uploads:/app/backend/data/uploads
  - app-tmp:/app/backend/data/tmp
  - app-images:/app/backend/data/images
```

- UCL 服务器部署流程：

```bash
git clone <gitlab-url>
cd microera-wiki-mvp
git lfs pull
docker compose up --build -d
```

- 如果以后引入 GitLab CI，需要在 checkout 后执行 `git lfs pull`，或确认 CI 配置会自动下载 LFS 文件。

### 3.3 Wiki 本地文件读取/下载

- `wiki_files.storage_path` 统一存相对 `backend/data` 的路径，例如 `zaozhi/xxx.pdf`，不存绝对路径。
- 新增/改造 `GET /api/files/:id/download` 为本地文件代理：
  - 按 entry 可见性做权限校验；
  - 将 `storage_path` 解析到 `config.dataDir` 下；
  - 校验解析后的真实路径仍在 `DATA_DIR` 内，防止路径穿越；
  - 以 `Content-Disposition: attachment` 流式返回。
- 导入脚本与 pipeline 的 `filePath` 保持解析为 `path.resolve(config.dataDir, storage_path)`。
- 前端 `SourceFileList.tsx` 改为调用真实下载接口，不再使用 mock。

### 3.4 `wiki_files` 是否必要

结论：保留 `wiki_files`，但用途简化为 entry 与本地文件的关联元数据。

- 需要的字段：`entry_id`、`original_filename`、`storage_path`、`file_type`、`file_size`、`usage_type`。
- Git LFS 方案不需要：`object_key`、`object_bucket`、`content_type`、`sha256`。
- 这些列可以暂时保留不动，避免再改数据库；后续清理时可移除，也可以继续保留作审计信息。
- MinIO 相关服务、`minio` 依赖、`storage:migrate` / `storage:upload` 脚本在本方案中不再使用，建议在确认 Git LFS 方案后清理或保持不合并。

## 4. 后续执行顺序（本次不执行）

1. 确认 GitLab 项目开启 LFS。
2. 修改 `.gitignore`、新增 `.gitattributes`、可选 `.lfsconfig`。
3. 修改 `docker-compose.yml` 卷配置。
4. 改造文件下载路由与 `storage_path` 相对路径规则。
5. `git add` PDF 与配置文件，提交并 push 到 GitLab。
6. UCL 上 clone + `git lfs pull` + 构建部署。

## 5. 风险与注意点

- 866 MB 对 GitLab LFS 存储和带宽有要求，需要确认 GitLab 配额。
- Docker build context 会变大；建议 CI/服务器保留构建缓存。
- `app-data:/app/backend/data` 卷必须改，否则镜像内 PDF 会被空卷隐藏。
- 如果部署到 Vercel，不适合承载 866 MB PDF；UCL/Docker 是正确目标。
- 当前工作区已有 MinIO 相关改动，建议在进入 Git LFS 实施前明确保留或回退范围。
