// Document-image ownership service (P1-B).
//
// The service layer between the parse pipeline and the `document_images`
// repository: registers provenance from a trusted parse, rolls back partial
// registrations on parse failure, and scans for orphaned files (a file with no
// ownership row) and dangling rows (an ownership row whose file is missing).
// The scan is read-only; pruning is a deliberate, separately-invoked step.
import fs from 'node:fs';
import path from 'node:path';
import { documentImageRepository } from '../repositories/document-image.repository.js';
import { config } from '../config.js';

export interface OrphanScan {
  /** Files under DATA_DIR/images with no `document_images` row. */
  unownedFiles: string[];
  /** `document_images` rows whose file is missing from disk. */
  missingFiles: string[];
}

export const documentImageService = {
  /**
   * Register provenance after a successful parse. Idempotent (retry-safe): a
   * re-run of the same document re-registers the same names without error.
   */
  async registerFromParse(documentId: number, savedImages: string[] = []): Promise<void> {
    await documentImageRepository.registerImages(documentId, savedImages);
  },

  /**
   * Failure cleanup: on a parse that dies part-way through, drop the document's
   * ownership rows so a later retry starts clean. Image files are left in place
   * (UUID-named and cheap to re-create); `orphanScan` identifies any that end
   * up unreferenced.
   */
  async rollbackDocumentImages(documentId: number): Promise<void> {
    await documentImageRepository.removeByDocument(documentId);
  },

  /**
   * Orphan GC scan (read-only). Compares the filesystem against the ownership
   * table in both directions. Does NOT delete anything — callers decide, and a
   * future GC job would prune `unownedFiles` only after a grace period.
   */
  async orphanScan(
    imagesDir: string = path.join(config.dataDir, 'images'),
  ): Promise<OrphanScan> {
    const names = await documentImageRepository.allImageNames();
    const owned = new Set(names);

    let files: string[] = [];
    try {
      files = fs.readdirSync(imagesDir);
    } catch {
      files = []; // images dir missing — everything registered is "missing"
    }
    const unownedFiles = files.filter((f) => !owned.has(f));
    const missingFiles = names.filter((n) => !files.includes(n));

    return { unownedFiles, missingFiles };
  },
};
