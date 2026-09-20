// Import Job Service — background job queue for knowledge imports.
// Decouples the HTTP upload request from the (potentially slow) parse → chunk →
// embed pipeline, so page switches / reloads don't appear to interrupt an import.
import fs from 'node:fs';
import path from 'node:path';
import { importService } from './import.service.js';
import type { ImportResult, StageResult, ImportInput } from './import.service.js';
import type { ChunkConfig } from '../chunk/service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ImportJob');

export type ImportJobStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface ImportJob {
  id: string;
  status: ImportJobStatus;
  filename: string;
  fileSize: number;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  result?: ImportResult;
  stages: StageResult[];
  error?: string;
  entryId?: number;
  metadata?: ImportInput['entryMetadata'];
  chunkConfig?: Partial<ChunkConfig>;
}

const MAX_CONCURRENT_IMPORTS = 2;

class ImportJobService {
  private jobs = new Map<string, ImportJob>();
  private queue: string[] = [];
  private running = new Set<string>();

  createJob(
    file: { originalname: string; size: number; path: string },
    options: {
      metadata?: ImportInput['entryMetadata'];
      chunkConfig?: Partial<ChunkConfig>;
    } = {},
  ): ImportJob {
    const id = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const jobsDir = path.resolve('./backend/data/jobs');
    fs.mkdirSync(jobsDir, { recursive: true });

    // Move the multer temp file to a stable, job-owned path so it survives the
    // request lifetime and can be read later by the background runner.
    const stablePath = path.join(jobsDir, `${id}.bin`);
    fs.renameSync(file.path, stablePath);

    const job: ImportJob = {
      id,
      status: 'pending',
      filename: file.originalname,
      fileSize: file.size,
      filePath: stablePath,
      createdAt: now,
      updatedAt: now,
      stages: [],
      metadata: options.metadata,
      chunkConfig: options.chunkConfig,
    };

    this.jobs.set(id, job);
    this.queue.push(id);
    this.schedule();

    logger.info(`Created job ${id} for ${file.originalname}`);
    return job;
  }

  private schedule(): void {
    while (
      this.running.size < MAX_CONCURRENT_IMPORTS &&
      this.queue.length > 0
    ) {
      const id = this.queue.shift()!;
      void this.runJob(id);
    }
  }

  private async runJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.status === 'cancelled') return;
    if (this.running.has(id)) return;

    this.running.add(id);
    job.status = 'running';
    job.updatedAt = new Date().toISOString();

    try {
      const buffer = await fs.promises.readFile(job.filePath);
      const result = await importService.importFromUpload(
        buffer,
        job.filename,
        job.metadata,
        { chunkConfig: job.chunkConfig },
      );

      // Cancelled mid-flight: the runner must not overwrite the cancelled state.
      if (job.status === 'cancelled') return;

      job.result = result;
      job.stages = result.stages ?? [];
      job.entryId = result.entryId;
      job.status = result.success ? 'success' : 'failed';
      job.error = result.errors?.join('; ') || undefined;
      job.updatedAt = new Date().toISOString();

      logger.info(`Job ${id} finished: ${job.status}`);
    } catch (err: any) {
      if (job.status !== 'cancelled') {
        job.status = 'failed';
        job.error = err.message || 'Unexpected runner error';
        job.updatedAt = new Date().toISOString();
      }
      logger.error(`Job ${id} failed`, err as Error);
    } finally {
      this.running.delete(id);
      this.cleanupFile(job.filePath);
      this.schedule();
    }
  }

  getJob(id: string): ImportJob | undefined {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }

  listJobs(limit = 50): ImportJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((j) => ({ ...j }));
  }

  cancelJob(id: string): ImportJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;

    if (job.status === 'pending') {
      job.status = 'cancelled';
      job.updatedAt = new Date().toISOString();
      this.queue = this.queue.filter((qid) => qid !== id);
      this.cleanupFile(job.filePath);
      return { ...job };
    }

    if (job.status === 'running') {
      job.status = 'cancelled';
      job.updatedAt = new Date().toISOString();
      return { ...job };
    }

    return { ...job };
  }

  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

export const importJobService = new ImportJobService();
