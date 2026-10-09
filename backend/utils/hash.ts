// Content hashing shared by the knowledge domain (revisions, backfill).
import { createHash } from 'node:crypto';

/** sha256 of utf-8 text — the integrity anchor for document revisions (K04). */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** sha256 of raw bytes — the integrity anchor for uploaded source files (P01).
 *  Re-imports are de-duplicated and integrity-checked against this digest. */
export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
