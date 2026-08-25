# Mirror blocker: local entry_tags orphan rows

```
generated_at: 2026-08-14
local_db: localhost:5433/microera_wiki (read-only check)
```

## Status
- UCL backup created and verified:
  - path: /tmp/microera_wiki_before_mirror_20260814.dump (NUC host)
  - size: 2.7M
  - sha256: 3dcd822ddb34ad709f2bddacd530db13adcb8c610b971099965407bbb6caee2f
  - pg_restore --list: OK (145 TOC entries, vector extension + all tables)
- Mirror SQL generation: **stopped** due to local tag integrity issue below.
- No database writes executed.

## Finding
Local `entry_tags` contains 17 rows whose `tag_id` does not exist in local `tags`.
Local `tags` has 16 rows; local `entry_tags` has 115 rows.

Missing tag ids (13 distinct): 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17, 18.

## Affected rows
| entry_id | title | missing tag_id |
| --- | --- | --- |
| 1 | 量子计算材料设计平台 | 11, 13, 14 |
| 2 | AI 驱动的实验数据分析能力 | 10, 16 |
| 3 | 某某智能计算方法专利 | 11, 17, 18 |
| 4 | 公司业务流程图 | 6 |
| 5 | 产品效果图 A | 4, 5 |
| 6 | 实地厂房照片 | 4, 7 |
| 7 | 材料结构数据条目 | 8, 12 |
| 8 | 实验数据存储结构说明 | 12, 16 |

## Candidate UCL tag names for the same ids (from UCL audit snapshot)
- 4=宣发素材, 5=产品图片, 6=流程图, 7=厂房照片, 8=数据格式
- 10=技术优势, 11=客户展示, 12=研发协作, 13=产品介绍, 14=材料计算
- 16=实验数据, 17=专利成果, 18=技术成果

## Impact on mirror counts
- Option A (drop orphan rows): final tags=16, final entry_tags=98, local/UCL entry_tags count will differ from local table count (115).
- Option B (restore names from UCL by id): final tags=29, final entry_tags=115, deviates from "local tags is the final set".

## Decision needed
Choose one of:
1. A: mirror only valid entry_tags (98) and local tags (16).
2. B: restore the 13 missing tag names from UCL by id and mirror all 115 entry_tags.
3. Repair local DB first, then regenerate mirror SQL.
