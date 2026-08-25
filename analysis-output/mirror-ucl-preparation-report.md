# UCL mirror preparation report (plan B)

Generated: 2026-08-14T06:33:55.834Z

## SQL artifact
- file: analysis-output/mirror-ucl-sync.sql
- size: 39173982 bytes
- sha256: 4eef5f6ae104c26780b21eb27ada65c3be04f93c5b78a38efea6e33f4c9052e6
- single transaction: enforced by `--single-transaction` at execution

## Recovered tags (13, from UCL by same tag_id)

| tag_id | UCL name | used by entries | name conflict |
| --- | --- | --- | --- |
| 4 | 宣发素材 | 5, 6 | NO |
| 5 | 产品图片 | 5 | NO |
| 6 | 流程图 | 4 | NO |
| 7 | 厂房照片 | 6 | NO |
| 8 | 数据格式 | 7 | NO |
| 10 | 技术优势 | 2 | NO |
| 11 | 客户展示 | 1, 3 | NO |
| 12 | 研发协作 | 7, 8 | NO |
| 13 | 产品介绍 | 1 | NO |
| 14 | 材料计算 | 1 | NO |
| 16 | 实验数据 | 2, 8 | NO |
| 17 | 专利成果 | 3 | NO |
| 18 | 技术成果 | 3 | NO |

## UCL-only tags to delete (22)

19, 20, 22, 24, 27, 32, 33, 122, 123, 124, 134, 189, 798, 799, 800, 803, 809, 810, 811, 812, 821, 846

## New tags to insert (3)

test, 手写笔记, 来关学

## Before / after counts

| table | UCL before | UCL after | delete | insert | notes |
| --- | --- | --- | --- | --- | --- |
| categories | 6 | undefined | 0 | 0 | keep UCL Chinese names |
| tags | 48 | 29 | 22 | 3 | 13 recovered + 3 new |
| entries | 306 | 345 | 306 | 345 | UCL-only 0; same-ID diff 300 |
| entry_tags | 865 | 115 | 865 | 115 | UCL-only 828 pairs; local-only 78 pairs |
| document_chunks | 647 | 3015 | 647 | 3015 | shared 117 overwritten |
| vectors | 476 | 2638 | 476 | 2638 | shared 117 overwritten |
| entry_relations | 21 | 2324 | 21 | 2324 | shared 21 overwritten |
| data_items | 0 | 0 | 0 | 0 | both empty |
| wiki_files | 0 | 0 | 0 | 0 | both empty |

## Deletion / overwrite summary

- UCL-only entries: 0 (IDs: none)
- Same-ID content-diff entries: 300 (replaced with local content)
- entry_tags: UCL-only 828 pairs deleted, local-only 78 pairs inserted
- document_chunks: UCL-only 530 deleted, local-only 2898 inserted, shared 117 overwritten
- vectors: UCL-only 359 deleted, local-only 2521 inserted, shared 117 overwritten
- entry_relations: UCL-only 0, local-only 2303 inserted, shared 21 overwritten
- categories: no delete/insert/update; UCL Chinese names kept (local `????` not copied)
- wiki_files / data_items: both 0, no change

## FK impact

- DELETE FROM entries cascades: entry_tags, wiki_files, data_items, document_chunks, vectors, entry_relations, bookmarks (bookmarks must be empty; guard raises otherwise)
- Preserved tables not touched: users, conversations, chat_messages, run_logs, connector_sync_log, _migrations, drizzle.__drizzle_migrations
- categories kept as-is with UCL Chinese names
- tags delete only applies to tags not in final 29-name set; entry_tags deleted first to avoid FK conflict

## Static check

# Mirror SQL static check (plan B)

Generated: 2026-08-14T06:33:24.835Z

| check | result |
| --- | --- |
| forbidden table users | PASS |
| forbidden table run_logs | PASS |
| forbidden table connector_sync_log | PASS |
| forbidden table _migrations | PASS |
| forbidden table __drizzle_migrations | PASS |
| forbidden table bookmarks | PASS |
| forbidden table conversations | PASS |
| forbidden table chat_messages | PASS |
| no UPDATE | PASS |
| no TRUNCATE | PASS |
| no DROP | PASS |
| no ALTER | PASS |
| no CREATE TABLE | PASS |
| recovered tags guard present | PASS |
| final count guard present | PASS |
| entry 21 present with local title | PASS |
| single transaction comment | PASS |
| tags target 29 | PASS |
| entries target 345 | PASS |
| entry_tags target 115 | PASS |
| chunks target 3015 | PASS |
| vectors target 2638 | PASS |
| relations target 2324 | PASS |
| DELETE only knowledge tables | PASS |
| INSERT only knowledge tables | PASS |

Summary: ALL PASS

SQL file: analysis-output/mirror-ucl-sync.sql
SHA256: 4eef5f6ae104c26780b21eb27ada65c3be04f93c5b78a38efea6e33f4c9052e6
Size: 39173982 bytes

