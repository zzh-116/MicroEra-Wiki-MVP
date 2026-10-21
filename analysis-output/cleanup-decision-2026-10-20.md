# 清理类任务决策文档（2026-10-20）

> 状态：**待拍板，未执行任何写库操作**
> 数据来源：`local-vs-ucl-audit.md` / `entry-file-audit.md` / `entry-file-audit-entries.csv` / `no-entry-files-report.md` / `mirror-ucl-blocker.md`（均为 2026-08 中旬生成）
> **重要：所有清单基于 08 月审计，执行前必须用 NUC 最新 dump 复核。**

---

## ⚠️ 状态更新（2026-10-20）——任务 1~4 已阻塞

原 NUC 生产库 `192.168.40.60` 已不可访问，恢复希望低；新测试机 `192.168.40.70` 仅 9 条种子数据，非生产环境。

**因此任务 1~4 的原目标数据已丢失，当前无法执行，标为「阻塞」。** 本文档降级为历史参考：若未来旧库/备份恢复，或走数据重建路径，可重新启用。

原始数据源仍在磁盘，重建可行：
- `backend/data` 共 507 个文件（176 PDF / 14 DOCX / 12 PPTX / 4 XLSX / 2 XLS / 2 TXT 等），分布在 `zaozhi/`、`reports/`、`laiguanxue/`。
- `backend/data/metadata/entries_export.json` 含 284 条、带原始 `id` 的元数据骨架（title / entry_type / summary / visibility / updated_at）。

---

## 0. 关键结论（先读这里）

1. **`Wiki: approval-testXX` 不是独立的"待删除条目"，而是 ID 9~40 的 MOF 条目在 UCL 侧被覆盖后的标题。** 本地库这些 ID 的正确标题仍是 `UiO-68-SMe-Pt`、`ZJU-195` 等 MOF 名。因此"删除 approval-test 污染"与"恢复 ID 9~40 标题"是**同一件事**：恢复标题即清除污染，不需要单独的删除动作。
2. **任务 1 真正独立的删除对象，是本地标题本身就是测试内容的条目**（如 `Friday Demo Upload Test`、`测试POST` 等），它们不涉及标题恢复。
3. **ID 9~40 的污染不止标题**：审计显示 `content_sha256` / `content_len` 也全部不一致，ID 9~12 连 `entry_type` 都变了，`created_at` / `updated_at` 也不一致。所以"恢复标题"不够，需恢复 `title + summary + content + category_id + created_at + updated_at`（9~12 再加 `entry_type`）。现有 `scripts/restore-entry-titles.mts` 只写标题、且 `manualTitles` 未覆盖 ID 9~40，不足以用于任务 2；数据源缺口详见第 2 节。
4. **条目↔文件关联表是 `wiki_files`（`entry_id` → `entries.id`），但本地和 UCL 该表都是 0 行**（`entries` 无 `source_file` 字段，迁移脚本里也没有）。即：审计报告里的 `source_file` 是脚本按标题/文件名在文件系统上匹配出来的，**库里从未持久化过关联**。任务 3/4 的"补关联"实际是**首次填充 `wiki_files`**，不是修已有的坏关联。

---

## 1. 四个必须拍板的问题

### Q1. 重启 mirror，还是放弃 mirror 改增量清理？

**背景**：8 月中旬已有一次「local → UCL」mirror 尝试（`mirror-ucl-sync.sql` / `mirror-ucl-sync-fixed.sql` / `mirror-ucl-deletion-plan.json`），因 tag 完整性问题（见 Q2）**中途停止，未执行任何写库**。

- 08-14 审计时本地库 345 条 entries、UCL 306 条；本地 `entry_relations` 2324 条、UCL 21 条。**"本地正确备份"指 08-14 审计时的本地库，不是当前开发库**——当前 `localhost:5432/microera_wiki` 已退化到 24 条有效（live）entries，不能作为恢复数据源。
- 若**重启 mirror**：任务 2（恢复 ID 9~40）直接由 mirror 的同步覆盖，不必另写恢复脚本。
- 若**放弃 mirror 改增量清理**：需要在文档里明确记录放弃原因，避免两套方案长期并存。

**选项**：
- A. 重启 mirror（先解决 Q2，再整体同步 local→UCL）。
- B. 放弃 mirror，逐项增量清理（任务 1~4 各做各的）。

---

### Q2. tag 完整性 blocker 选哪个修复方案？

**背景**（`mirror-ucl-blocker.md`）：本地 `entry_tags` 有 17 行 `tag_id` 不存在于本地 `tags` 表（缺 13 个 tag id：4,5,6,7,8,10,11,12,13,14,16,17,18）。这会拦在所有带标签条目的写库操作上。

**选项**（原 blocker 文档给出的三个）：
- A. 只 mirror 有效的 98 条 entry_tags + 16 条本地 tags（丢弃 17 行孤儿）。
- B. 从 UCL 按 id 恢复 13 个缺失 tag 名，mirror 全部 115 条 entry_tags。
- C. 先修复本地 DB，再重新生成 mirror SQL。

> 倾向：A 或 C 更干净；B 会让本地 tag 集合偏离"本地为准"的口径。需业务拍板。

---

### Q3. 能否提供 NUC 最新 dump（或只读查询权限）？

- 现存 08-14 的 dump 在 NUC 主机 `/tmp/microera_wiki_before_mirror_20260814.dump`（2.7M，已验证 sha256），但已过 2 个月。
- 执行前需要**最新 dump** 重新生成 counts，diff 08 月审计，确认 328/345 口径与污染范围是否仍成立。
- 无最新 dump 时，本文档所有清单都只是"草案"，不能落地。

---

### Q4. 条目-文件关联实际存在哪张表/字段？

**已查清**（`backend/db/schema.ts`）：
- 关联表 = `wiki_files`，`entry_id` 外键 → `entries.id`（`onDelete: cascade`）。
- `entries` 表**没有** `source_file` 字段；7 个迁移脚本里也没有。
- **本地和 UCL 的 `wiki_files` 都是 0 行** → 关联从未持久化，审计里的 `source_file` 是脚本匹配结果。

**结论**：任务 3/4 的"补关联"= **首次向 `wiki_files` 写入记录**。执行前需确认：
- 用现有 `scripts/migrate-files-to-minio.mts` / `upload-local-file-to-minio.mts` 的写入逻辑，还是新写。
- 关联写入时 `storedFilename` / `storagePath` / `objectKey` 的取值口径（本地路径 vs MinIO 对象键）。

---

## 2. ID 9~40 逐条决策表（恢复 vs 删除）

> 本地标题 = 正确 MOF 名；UCL 标题 = 被测试数据覆盖后的标题。
> 默认建议：**全部恢复**（这些是早期 MOF 条目，业务价值待定但不应默认丢弃）。
> "删除"是备选：若业务判定某条 MOF 条目本身不再需要，才改软删除。

| ID | 本地正确标题 | UCL 被污染标题 | 类型 / 来源 | 建议 |
| --- | --- | --- | --- | --- |
| 9 | UiO-68-SMe-Pt | JAKBIJ_clean-(id_178331) | academic_paper / manual | 恢复（含 entry_type） |
| 10 | ZJU-195([Cu2L(H2O)2]) | summary_core2019_passed_20260228155400A107.csv | academic_paper / manual | 恢复（含 entry_type） |
| 11 | MOF-OH | UiO-68-SMe-Pt 乙炔/乙烯气敏材料合成方案 | academic_paper / manual | 恢复（含 entry_type） |
| 12 | NKMOF-1-Ni | MOF+传感器+乙炔_20260203174629A011.xlsx | academic_paper / manual | 恢复（含 entry_type） |
| 13 | Cu(I)-MOF(CuI@...) | Wiki: Test-Approval | academic_paper / manual | 恢复 |
| 14 | APPT-Cd | Wiki: TEST.PJ.1767151358943 | academic_paper / manual | 恢复 |
| 15 | UTSA-200 | Wiki: approval-test16 | academic_paper / manual | 恢复 |
| 16 | MIL-100(Cr) | Wiki: approval-test15 | academic_paper / manual | 恢复 |
| 17 | TIFSIX-2-Cu-i | Wiki: approval-test12 | academic_paper / manual | 恢复 |
| 18 | Fe-MOF(Compound 1) | Wiki: approval-test11 | academic_paper / manual | 恢复 |
| 19 | NOTT-300 | Wiki: test-approval10-1 | academic_paper / manual | 恢复 |
| 20 | Zn-MOF(FJI-H11) | Wiki: approval-test8-1 | academic_paper / manual | 恢复 |
| 21 | Cu-In/NU-907 | Wiki: approval-test7 | academic_paper / manual | 恢复 |
| 22 | Rigid-Flexible MOF(Zn-btb-dmtrz) | Wiki: WorkHours Project | sandbox_project / sandbox | 恢复 |
| 23 | MFM-520 | Wiki: detail-tesk | sandbox_project / sandbox | 恢复 |
| 24 | MFM-190(NO2) | Wiki: Approval-3.1 | sandbox_project / sandbox | 恢复 |
| 25 | Cu2(pzdc)2(pyz) | Wiki: approval-test24-2 | sandbox_project / sandbox | 恢复 |
| 26 | NUM-15 | Wiki: Approval-1.2 | sandbox_project / sandbox | 恢复 |
| 27 | CAU-10-H | Wiki: approval-test22 | sandbox_project / sandbox | 恢复 |
| 28 | Zn-CAT | Wiki: approval-test21-4 | sandbox_project / sandbox | 恢复 |
| 29 | ZU-610a | Wiki: approval-test20 | sandbox_project / sandbox | 恢复 |
| 30 | FJU-22a | Wiki: HHD | sandbox_project / sandbox | 恢复 |
| 31 | Zn-CAT 系列 | Wiki: approval-test19 | sandbox_project / sandbox | 恢复 |
| 32 | UTSA-74 | Wiki: approval-test2 | sandbox_project / sandbox | 恢复 |
| 33 | IPM-100 | Wiki: approval-test5 | sandbox_project / sandbox | 恢复 |
| 34 | ZNU-1 | Wiki: approval-test3 | sandbox_project / sandbox | 恢复 |
| 35 | Cu(OH)INA | Wiki: MiQroTEST | sandbox_project / sandbox | 恢复 |
| 36 | NTU-67 | Wiki: 沙盘测试专用 | sandbox_project / sandbox | 恢复 |
| 37 | UTSA-100 | Wiki: approval-test1 | sandbox_project / sandbox | 恢复 |
| 38 | BSF-1 | Wiki: WorkhoursP | sandbox_project / sandbox | 恢复 |
| 39 | M'MOF-3 | Wiki: TEST | sandbox_project / sandbox | 恢复 |
| 40 | HKUST-1 | Wiki: 测试项目 | sandbox_project / sandbox | 恢复 |

**注意**：
- 恢复字段 = `title + summary + content + category_id + created_at + updated_at`；ID 9~12 额外恢复 `entry_type`。
- **恢复数据源（需逐字段核对）**：
  - `backend/data/metadata/entries_export.json`（2026-07-16，284 条）**含 ID 9~40 的正确 `title` / `entry_type` / `summary` / `visibility` / `updated_at`**，但**不含 `content`、`category_id`、`created_at`**。
  - `content` / `category_id` / `created_at` 需另找 08-14 时点的本地完整 dump；`/tmp/microera_wiki_before_mirror_20260814.dump` 是 UCL（污染侧）备份，**不能当正确源**。若找不到完整 dump，任务 2 只能恢复标题/摘要，content 无法恢复——这是当前最大数据缺口。
  - `scripts/restore-entry-titles.mts` 只写 `title` 一个字段，且 `manualTitles` 从 ID 48 开始、**未覆盖 ID 9~40**，不能直接用于任务 2。
- 本表需用最新 UCL dump 复核：确认这些 ID 在 UCL 现在的标题是否仍为测试标题、导出/本地是否正确。

---

## 3. 109 个无文件 entry 三档清单

> 按处理动作分档；"无文件"= `entry-file-audit-entries.csv` 里 `file_count_confirmed = 0`。

| 档 | 数量 | 构成 | 处理动作 |
| --- | --- | --- | --- |
| **档 1：本就不该有本地文件** | 84 | sandbox 项目 75（ID 22~96）、data_standard 2（ID 7、8）、template 3（ID 4、5、6）、早期概念 manual 3（ID 1、2、3）、doi_crossref 1（ID 284 飞书文档-知识库首页） | 无动作（或仅确认保留） |
| **档 2：本地标题即测试内容，建议软删除** | 5 | handwritten 5：ID 278 Demo上传测试文档（示例）、279 Friday Demo - Upload Test、280 Friday Demo Upload Test、281 Friday Check、282 Friday File Upload | 软删除（`deleted_at = now()`） |
| **档 3：声明了 source_file 但文件缺失，需补或删** | 7 | ID 287 SAGE（缺 2605.12061v1.pdf）、296 vscode wiki 开发记录（缺 vscode wiki.docx）、297 wiki 数据需求（缺 wiki 数据需求.docx）、306 OpenViking（缺 prompt.txt）、312/313/314 三份简历（缺对应 PDF） | 能找到文件则补，找不到则软删除或标注"文件缺失" |
| **档 4（交叉任务 2）** | 13 | ID 9~21 早期 MOF 学术条目（manual 源，academic_paper） | 随任务 2 的恢复/删除决策走；文件方面本就是 manual 录入，无需补 |

合计 84 + 5 + 7 + 13 = 109。

---

## 4. 135 个未关联文件的 A/B/C/D 策略

> 来源 `no-entry-files-report.md`（扫描 223 文件、唯一 SHA256 211、noEntry 135）。

| 分类 | 数量 | 含义 | 处理动作 |
| --- | --- | --- | --- |
| A | 23 | definite match（`source_summary` / `normalized_title`） | **挂关联**：写入 `wiki_files`，关联到对应 entry |
| D | 8 | same sha256 的重复文件（已有一个 primary 文件挂着） | **删除/忽略重复路径**（不是再挂一条关联） |
| B | 101 | high-confidence 候选（score 0.85~1.00，多为 `metadata_in_db` / `pdf_title`） | **人工确认后**再挂关联 |
| C | 3 | 明确孤立，无 entry 也无候选 | **归档/删除**（备份后） |

**注意**：A+D 的"自动"脚本要分开写——A 是 upsert 到 `wiki_files`，D 是删除重复文件路径；B 出人工审核表（按 score 排序）；C 先备份再删。

---

## 5. 执行纪律（任务 1~4 统一）

1. **pre-dump**：任何写库前，先在 NUC 做一次完整 `pg_dump`，记录 sha256 与路径。
2. **dry-run**：每个任务先出"执行前后计数"（受影响 entry / tag / file 条数），确认无误再写。
3. **只用可逆写**：
   - 删除 → soft delete（`deleted_at = now()`），不做 hard delete。
   - 恢复标题/内容（任务 2）→ upsert，写前保留原值快照。
   - 补关联（任务 3/4）→ 首次写入 `wiki_files`，用 `usage_type` 区分来源；动关联前备份原映射（当前为空表）。
4. **批次**：任务 1/2 与 3/4 分两个批次执行，各自独立 pre-dump + dry-run，便于定位问题与回滚。
5. **不生成直接写库的 SQL 到生产**；所有变更脚本先在本地库（`localhost:5432/microera_wiki`，见 `.env`）验证。
6. **本文档及其派生清单，在拿到最新 dump 复核前，不生成也不执行任何写库 SQL。**

---

## 附：数据来源对照

| 结论 | 来源 |
| --- | --- |
| ID 9~40 本地/UCL 标题对照 | `local-vs-ucl-audit.md`（本地 345 / UCL 306） |
| 109 无文件 entry 及 source | `entry-file-audit.md` + `entry-file-audit-entries.csv` |
| 135 未关联文件 A/B/C/D | `no-entry-files-report.md` / `.json` |
| tag blocker | `mirror-ucl-blocker.md` |
| 文件关联表 schema | `backend/db/schema.ts`（`wiki_files` / `entries`） |
