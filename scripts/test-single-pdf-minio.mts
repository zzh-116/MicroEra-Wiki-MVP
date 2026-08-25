// Single real PDF end-to-end test against a local MinIO instance.
// Credentials come from process env (MINIO_ACCESS_KEY / MINIO_SECRET_KEY);
// this file contains no secrets. It does not run the full migration.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../backend/db/connection.js';
import { entries } from '../backend/db/schema.js';
import { fileRepository } from '../backend/repositories/file.repository.js';
import { objectStorageService } from '../backend/services/object-storage.service.js';
import { objectKeyFor, contentTypeForFile } from '../backend/services/file-migration.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = path.resolve(__dirname, '../backend/data/zaozhi/paper_retrieval.pdf');
const TARGET_ENTRY_ID = 244;
const BUCKET = objectStorageService.bucket;

function sha256Of(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function main() {
  const out: Record<string, unknown> = {};

  // 1. health
  const health = await objectStorageService.checkHealth(8000);
  out.health = health;
  if (!health.ok) throw new Error(`MinIO health check failed: ${health.reason}`);

  // 2. bucket
  const client = objectStorageService.getClient();
  let bucketExists = await client.bucketExists(BUCKET);
  if (!bucketExists) {
    await client.makeBucket(BUCKET);
    bucketExists = await client.bucketExists(BUCKET);
  }
  out.bucket = { name: BUCKET, exists: bucketExists };
  if (!bucketExists) throw new Error(`bucket ${BUCKET} could not be created`);

  // 3. local PDF + metadata
  if (!fs.existsSync(SAMPLE_PDF)) throw new Error(`sample PDF missing: ${SAMPLE_PDF}`);
  const local = fs.readFileSync(SAMPLE_PDF);
  const fileName = path.basename(SAMPLE_PDF);
  const sha256 = sha256Of(local);
  const size = local.length;
  const contentType = contentTypeForFile(fileName);
  const objectKey = objectKeyFor(sha256, path.extname(fileName).toLowerCase());
  out.localFile = { fileName, size, sha256, contentType, objectKey };

  // 4. valid live entry (deleted_at must be null)
  const entryRows = await db
    .select({ id: entries.id, title: entries.title, entryType: entries.entryType })
    .from(entries)
    .where(and(eq(entries.id, TARGET_ENTRY_ID), isNull(entries.deletedAt)))
    .limit(1);
  if (entryRows.length === 0) throw new Error(`entry #${TARGET_ENTRY_ID} is missing or soft-deleted`);
  out.entry = entryRows[0];

  // 5. upload
  await objectStorageService.putObject(objectKey, local, size, contentType, BUCKET);
  out.upload = { objectKey, bucket: BUCKET, status: 'uploaded' };

  // 6. headObject
  const stat = await objectStorageService.headObject(objectKey, BUCKET);
  out.headObject = { size: stat.size, etag: stat.etag };
  if (stat.size !== size) throw new Error(`headObject size mismatch: ${stat.size} != ${size}`);

  // 7. create wiki_files record
  const created = await fileRepository.create({
    name: fileName,
    size,
    type: contentType,
    entryId: entryRows[0].id,
    usageType: 'document',
    storagePath: SAMPLE_PDF,
    objectKey,
    objectBucket: BUCKET,
    sha256,
    contentType,
  });
  out.wikiFile = created;

  // 9. getObject -> recompute sha256 and size
  const stream = await objectStorageService.getObject(objectKey, BUCKET);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const downloaded = Buffer.concat(chunks);
  const downloadedSha = sha256Of(downloaded);
  const getObjectResult = {
    size: downloaded.length,
    sha256: downloadedSha,
    match: downloadedSha === sha256 && downloaded.length === size,
  };
  out.getObject = getObjectResult;
  if (!getObjectResult.match) throw new Error('getObject content does not match local file');

  // 10. presigned URL generation + actual GET
  const presigned = await objectStorageService.getPresignedUrl(objectKey, 300, BUCKET);
  const res = await fetch(presigned, { method: 'GET' });
  const body = Buffer.from(await res.arrayBuffer());
  out.presigned = {
    generated: Boolean(presigned),
    httpStatus: res.status,
    contentLength: Number(res.headers.get('content-length') || body.length),
    bodyMatch: body.length === size,
  };
  if (res.status !== 200 || body.length !== size) {
    throw new Error(`presigned GET failed: status=${res.status}, bytes=${body.length}`);
  }

  console.log(JSON.stringify(out, null, 2));
  await db.$client.end();
}

main().catch(async (err) => {
  console.error('E2E_TEST_FAILED:', (err as Error).message);
  try {
    await db.$client.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
