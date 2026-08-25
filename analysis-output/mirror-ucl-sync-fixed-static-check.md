# Mirror SQL fixed static check

Generated: 2026-08-14T06:42:15.643Z

| check | result |
| --- | --- |
| no DROP/ALTER/TRUNCATE/CREATE TABLE/UPDATE | PASS |
| forbidden users | PASS |
| forbidden run_logs | PASS |
| forbidden connector_sync_log | PASS |
| forbidden _migrations | PASS |
| forbidden __drizzle_migrations | PASS |
| forbidden bookmarks | PASS |
| forbidden conversations | PASS |
| forbidden chat_messages | PASS |
| DELETE only knowledge tables | PASS (vectors,entry_relations,entry_tags,wiki_files,document_chunks,data_items,entries,tags) |
| INSERT only knowledge tables | PASS (tags,entries,entry_tags,document_chunks,vectors,entry_relations) |
| entries 345 | PASS (345) |
| entry_tags 115 | PASS (115) |
| chunks 3015 | PASS (3015) |
| vectors 2638 | PASS (2638) |
| relations 2324 | PASS (2324) |
| tags insert 16 | PASS (16) |
| tag delete values 29 | PASS (29) |
| recovered guard 13 | PASS (13) |
| required entry ids present | PASS |
| entry 21 local title | PASS |
| has BEGIN | PASS |
| has COMMIT | PASS |
| BEGIN before first DO | PASS |
| COMMIT after last END | PASS |
| tag INSERT VALUES all parenthesized | PASS |
| tag DELETE VALUES all parenthesized | PASS |
| final tag name set 29 | PASS (29 names) |

Summary: ALL PASS

SQL file: analysis-output/mirror-ucl-sync-fixed.sql
SHA256: dab15a1a7c1b85cce1701e8d9516e40763966dd898e316e92701d1d4e54f765b
Size: 39174057 bytes
