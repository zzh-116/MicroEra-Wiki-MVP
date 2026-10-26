# 12. Docling 环境复现（Windows + Python 3.12）

本文说明如何在**另一台 Windows 电脑**上，从全新 clone 开始配置 Python 3.12 + Docling，并成功运行 PDF/DOCX 解析。目标：不依赖任何一位开发者的个人绝对安装路径。

---

## 12.1 依赖版本（最小可复现清单）

| 组件 | 版本 | 说明 |
|------|------|------|
| Python | **3.10–3.12**（已验证 3.12.9） | 3.13+ 与预发布版（如 3.15.0b3）**不被支持** |
| Docling | **2.111.0**（固定） | `requirements.txt` 中唯一硬钉 |
| 传递依赖 | docling-core 2.86.0 · docling-parse 7.7.0 · docling-ibm-models 3.13.3 | 由 pip 自动解析，无需手写 |

清单文件：仓库根 `requirements.txt`（**不是** `pip freeze` 全量导出，只钉解析器本体；OCR 引擎为可选 extra，见 12.3）。

---

## 12.2 安装（PowerShell）

```powershell
# 1. 安装 Python 3.12（务必选择 3.12，不要 3.13/3.15 预发布版）
#    https://www.python.org/downloads/release/python-3129/
#    安装时勾选 “Add python.exe to PATH”

# 2. 确认解释器版本（必须是 3.10–3.12）
python --version          # 期望：Python 3.12.x

# 3. 创建独立虚拟环境（推荐，避免污染系统 Python）
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 4. 安装 Docling（固定版本）
python -m pip install -r requirements.txt

# 5. 验证 CLI 可执行
docling --version
```

> 若 `python -m venv` 报 `No module named venv`：你的 Python 是精简版（缺失 `venv`/`ensurepip`）。改从官方 python.org 完整安装，或用 `python -m pip install --user -r requirements.txt` 直接装到用户目录。

---

## 12.3 OCR（可选，仅扫描件/图片需要）

纯 PDF/DOCX 的文本与内嵌图片提取**不需要** OCR。仅当需要解析扫描版 PDF 或纯图片时：

```powershell
python -m pip install "docling[ocr]==2.111.0"
```

会额外安装 rapidocr-onnxruntime、rapidocr、onnxruntime。已验证环境包含这些引擎。

---

## 12.4 配置（环境变量）

后端通过两个环境变量定位 Python/Docling，**默认自动探测 PATH，不依赖绝对路径**：

| 变量 | 作用 | 示例 |
|------|------|------|
| `DOCLING_CMD` | Docling CLI 显式路径/命令名 | `C:\...\Python312\Scripts\docling.exe` |
| `DOCLING_PYTHON` | 用于导入探测 + 版本检查的解释器 | `C:\...\Python312\python.exe` |

写入 `.env`（复制自 `.env.example`）：

```dotenv
DOCLING_CMD=
DOCLING_PYTHON=
```

留空即自动探测。只有自动探测失败（例如系统 PATH 上的 `python` 指向了不受支持的版本）时才需要显式填写。**`start.ps1` 已不再硬编码任何用户路径**，而是按此优先级解析：`DOCLING_CMD`/`DOCLING_PYTHON` → `py -3.12` 启动器 → PATH 上的 `docling`/`python`（版本校验 3.10–3.12）→ 常见安装目录。

---

## 12.5 启动

```powershell
# 方式一：项目脚本（自动解析并导出 DOCLING_CMD/DOCLING_PYTHON 后启动后端）
.\start.ps1

# 方式二：手工设置后启动
$env:DOCLING_CMD = "C:\...\Python312\Scripts\docling.exe"
$env:DOCLING_PYTHON = "C:\...\Python312\python.exe"
npm run server
```

解析 Worker（`npm run worker`）复用同一套 `DOCLING_CMD`/`DOCLING_PYTHON` 解析逻辑，无需额外配置。

---

## 12.6 验证

```powershell
# 一键环境检查：Python 版本 / Docling CLI / import / 模型缓存 / 实际解析
npm run docling:doctor
# 跳过慢速真实解析：npm run docling:doctor -- --quick

# 解析回归测试（真实 PDF/DOCX fixture，走 Docling → Worker → 文档解析）
npx vitest run tests/parity/parse-phase2-docling-e2e.test.ts tests/parity/parse-phase2-images.test.ts tests/parity/parse-phase3-tb3.test.ts tests/parity/docling-env-resolution.test.ts

# 全量测试 + 前后端类型检查
npx vitest run
npm run typecheck:backend
npm run lint
```

`docling:doctor` 全部 PASS 时退出码为 0，任一 FAIL 为非 0。模型缓存缺失会提示“首次解析将联网下载模型”，属正常（Docling 按需下载到 `~/.cache/huggingface/hub`）。

---

## 12.7 常见错误处理

| 现象 | 原因 | 处理 |
|------|------|------|
| `DOCLING_DEPENDENCY_MISSING` / “Docling CLI not found” | Docling 未安装或不在 PATH | `python -m pip install -r requirements.txt`；或设 `DOCLING_CMD` |
| 报 `PYTHON_UNSUPPORTED`（解释器版本不符） | PATH 上的 `python` 是 3.13+ / 预发布版 | 安装 Python 3.12，并设 `DOCLING_PYTHON` 指向其 `python.exe` |
| 报 `CLI_NOT_EXECUTABLE`（DOCLING_CMD 不可执行） | `DOCLING_CMD` 路径错误或无执行权限 | 确认指向 `...\Python312\Scripts\docling.exe`，运行 `& $env:DOCLING_CMD --version` 验证 |
| 解析首次极慢（10–15s+） | 模型首次下载 | 正常；`docling:doctor` 会提示模型缓存状态 |
| `python -m venv` 报 `No module named venv` | 精简版 Python | 用官方完整安装包，或 `--user` 安装 |
| 中文文件名解析乱码 | Docling 在 Windows 对非 ASCII 临时名处理不佳 | 解析器已自动复制为 ASCII 安全名再解析（无需处理） |

> 说明：以上三类缺失/不符/不可执行均为**显式报错**，不会被静默当作解析成功。后端在解析失败时返回明确的 `DEPENDENCY_MISSING` → `DOCLING_DEPENDENCY_MISSING`，任务进入正常重试/死信路径。
