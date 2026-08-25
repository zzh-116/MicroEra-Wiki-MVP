// Test/migration helper: upload one local file to MinIO and record the
// object key in wiki_files. Existing files and git history are untouched.
// Usage: npm run storage:upload -- <filePath> <entryId>
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileRepository } from '../backend/repositories/file.repository.js';
import { objectStorageService } from '../backend/services/object-storage.service.js';

const filePath = process.argv[2];
const entryId = Number(process.argv[3]);

function contentTypeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  return map[ext] || 'application/octet-stream';
}

if (!filePath || !Number.isInteger(entryId) || entryId <= 0) {
  console.error('Usage: npm run storage:upload -- <filePath> <entryId>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);
const sha256 = createHash('sha256').update(buffer).digest('hex');
const ext = path.extname(filePath).toLowerCase();
const key = `docs/${entryId}/${randomUUID()}${ext}`;
const contentType = contentTypeFor(filePath);

await objectStorageService.putObject(key, buffer, buffer.length, contentType);

const row = await fileRepository.create({
  name: path.basename(filePath),
  size: buffer.length,
  type: contentType,
  entryId,
  usageType: 'document',
  objectKey: key,
  objectBucket: objectStorageService.bucket,
  sha256,
  contentType,
});

console.log(
  JSON.stringify(
    {
      uploaded: true,
      key,
      bucket: objectStorageService.bucket,
      sha256,
      contentType,
      wikiFileId: row.id,
    },
    null,
    2,
  ),
);
