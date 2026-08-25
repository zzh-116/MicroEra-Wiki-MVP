# Entry ↔ 本地文件资产盘点（只读）

生成时间: 2026-08-14T09:29:52.249Z

## 总览

- entries 总数: 345（live 328 / 软删除 17）
- 本地扫描文件: 223（唯一 SHA256: 211）
- wiki_files 记录: 0

## 双向关系统计

| 指标 | 数量 |
| --- | --- |
| A. entry 有文件 | 219 |
| B. entry 没有文件 | 109 |
| C. entry 对应 1 个文件 | 116 |
| D. entry 对应多个文件 | 103 |
| E. 1 个文件对应多个 entry | 84 |
| F. 文件找不到 entry | 3（另有仅候选 0） |
| G. 重复文件组 / 重复物理文件 | 12 / 24 |

## source 分布（live entries）

| source | 数量 |
| --- | --- |
| sandbox | 75 |
| manual_or_unknown | 19 |
| data_standard | 2 |
| local_file | 225 |
| handwritten | 5 |
| doi_crossref | 1 |
| arxiv_local_pdf | 1 |

| source_type | 数量 |
| --- | --- |
| sandbox_project | 75 |
| tech_doc | 1 |
| patent | 1 |
| template | 4 |
| data_standard | 2 |
| academic_paper | 14 |
| mixed | 5 |
| ppt | 11 |
| pdf | 175 |
| word | 20 |
| handwritten_note | 5 |
| arxiv_pdf | 1 |
| text | 11 |
| excel | 3 |

## 迁移建议（reverse 表汇总）

| 建议 | 文件数 | 唯一 SHA256 |
| --- | --- | --- |
| migrate_and_link | 196 | 196 |
| migrate_and_link_reuse_object | 24 | 12 |
| keep_orphan | 3 | 3 |

## 引用了本地文件但文件缺失/仅 tmp 的条目

- #287 SAGE: A Self-Evolving Agentic Graph-Memory Engine for Structure-Aware Associative Memory（other_dir_name_variant: 2605.12061v1.pdf）
- #296 vscode wiki 开发记录（missing: vscode wiki.docx）
- #297 wiki 数据需求（missing: wiki 数据需求.docx）
- #306 OpenViking 对 MicroEra-Wiki 的可参考设计（missing: prompt.txt）
- #312 王熠赟（化学材料研究员）（missing: 【化学材料研究员_苏州 8-12K】yiyun.wang 1年.pdf）
- #313 王梦瑶（化学材料研究员）（missing: 【化学材料研究员（实验方向）_苏州 8-12K】王梦瑶 26年应届生(1).pdf）
- #314 毛思慧（化学材料研究员）（missing: 【化学材料研究员（实验方向）_苏州 8-12K】毛思慧 25年应届生(1).pdf）

## 说明

- confidence >= 0.85 视为“已确认”匹配（exact_title / normalized_title / source_summary / sha256_duplicate / source_file_variant / metadata_in_db / pdf_title 强匹配）。
- 0.5~0.84 视为候选（pdf_title 弱匹配 / patent_number / id_token / fuzzy）。
- 完整逐条明细见 entry-file-audit.json。