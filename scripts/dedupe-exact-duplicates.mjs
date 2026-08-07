import pg from 'pg';
import fs from 'node:fs/promises';

const dryRun = process.env.DRY_RUN === '1';
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5433/microera_wiki',
});

const duplicates = await pool.query(`
  WITH ranked AS (
    SELECT id, title, entry_type, visibility, summary, content, updated_at,
           row_number() OVER (
             PARTITION BY md5(content), title
             ORDER BY updated_at DESC, id DESC
           ) AS rn
    FROM entries
    WHERE deleted_at IS NULL AND length(content) > 0
  )
  SELECT id, title, entry_type, visibility, summary, updated_at
  FROM ranked
  WHERE rn > 1
  ORDER BY title, id;
`);

const toDeleteIds = duplicates.rows.map((r) => r.id);
console.log('TO_DELETE_COUNT', toDeleteIds.length);
for (const r of duplicates.rows) {
  console.log(`${r.id}\t${r.title.slice(0, 70)}\t${r.entry_type}`);
}

if (dryRun) {
  console.log('DRY_RUN', true);
  await pool.end();
  process.exit(0);
}

if (toDeleteIds.length > 0) {
  const backupPath = 'backend/data/metadata/duplicate_content_backup.json';
  const backup = await pool.query(
    `SELECT id, title, entry_type, summary, content, visibility, category_id, created_at, updated_at
     FROM entries WHERE id = ANY($1) ORDER BY id`,
    [toDeleteIds],
  );
  await fs.writeFile(backupPath, JSON.stringify(backup.rows, null, 2), 'utf8');
  console.log('BACKUP', backupPath, backup.rows.length);

  const deleted = await pool.query(
    `UPDATE entries SET deleted_at = now() WHERE id = ANY($1) RETURNING id`,
    [toDeleteIds],
  );
  console.log('SOFT_DELETED', deleted.rows.length);
}

const after = await pool.query(`
  SELECT
    count(*) FILTER (WHERE deleted_at IS NULL) AS live_total,
    count(DISTINCT title) FILTER (WHERE deleted_at IS NULL) AS distinct_titles,
    count(*) FILTER (WHERE deleted_at IS NULL AND entry_type = 'academic_paper') AS papers,
    count(*) FILTER (WHERE deleted_at IS NULL AND entry_type = 'sandbox_project') AS sandbox,
    count(*) FILTER (WHERE deleted_at IS NULL AND entry_type = 'data_standard') AS standards
  FROM entries;
`);
console.log('AFTER', JSON.stringify(after.rows[0]));
await pool.end();
