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
