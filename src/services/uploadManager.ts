// UploadManager — global singleton that owns knowledge-import uploads.
// Uploads survive React unmount (page switches) because their state lives here
// in module scope, not in component state. Components subscribe to progress;
// the manager keeps polling the backend job to its terminal state regardless
// of which page is currently mounted.
import { adminApi, mapSpaceToEntryType } from '../api/adminApi';
import type { ImportJob, ServerImportJob } from '../api/adminApi';
import { getToken } from '../api/client';

/** Frontend-local stage shape — do NOT reference the backend `StageResult`. */
export interface UploadStage {
  stage: string;
  status: 'success' | 'failed' | 'skipped';
  ms: number;
  detail: string;
}

export type UploadJobStatus =
  | 'uploading'
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface UploadJob {
  id: string;
  filename: string;
  fileSize: number;
  targetSpaceId: string;
  status: UploadJobStatus;
  uploadProgress: number | null;
  stages: UploadStage[];
  error?: string;
  entryId?: number;
  /** Backend job id (`imp-…`) returned by /pipeline/import, for binary uploads. */
  serverJobId?: string;
  createdAt: string;
  updatedAt: string;
}

type Listener = () => void;

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_FAILURES = 10;

/** Canonical stage keys for the legacy text-file path (parse → chunk → embed). */
const LEGACY_STAGE_KEYS = ['parse', 'chunk', 'embed'];

class UploadManager {
  private jobs = new Map<string, UploadJob>();
  private listeners = new Set<Listener>();
  private pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private xhrs = new Map<string, XMLHttpRequest>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  getJob(id: string): UploadJob | undefined {
    const job = this.jobs.get(id);
    return job ? { ...job } : undefined;
  }

  getJobs(): UploadJob[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((j) => ({ ...j }));
  }

  private update(id: string, patch: Partial<UploadJob>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    this.notify();
  }

  private isTextFile(name: string): boolean {
    return /\.(md|txt|csv|json|xml|yaml|yml|log|html|htm|adoc|asciidoc)$/i.test(name);
  }

  startUpload(file: File, targetSpaceId: string): string {
    const id = `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const job: UploadJob = {
      id,
      filename: file.name,
      fileSize: file.size,
      targetSpaceId,
      status: 'uploading',
      uploadProgress: 0,
      stages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    this.notify();

    if (this.isTextFile(file.name)) {
      void this.uploadTextFile(id, file, targetSpaceId);
    } else {
      void this.uploadBinaryFile(id, file, targetSpaceId);
    }
    return id;
  }

  cancelUpload(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    if (job.status === 'uploading') {
      const xhr = this.xhrs.get(id);
      if (xhr) xhr.abort();
    }
    this.stopPolling(id);

    if ((job.status === 'pending' || job.status === 'running') && job.serverJobId) {
      adminApi.cancelImportJob(job.serverJobId).catch(() => {
        /* best-effort cancel */
      });
    }

    if (job.status !== 'success' && job.status !== 'failed') {
      job.status = 'cancelled';
      job.uploadProgress = null;
      job.updatedAt = new Date().toISOString();
    }
    this.notify();
  }

  // ── Text files: reuse the existing synchronous /pipeline/import/string path ──
  private async uploadTextFile(id: string, file: File, targetSpaceId: string): Promise<void> {
    try {
      const text = await file.text();
      if (this.isCancelled(id)) return;

      this.update(id, { status: 'running', uploadProgress: null });
      const result = await adminApi.startImportJob(
        { name: file.name, size: file.size, data: text },
        targetSpaceId,
      );
      if (this.isCancelled(id)) return;

      const success = result.status === 'success';
      this.update(id, {
        status: success ? 'success' : 'failed',
        stages: this.adaptLegacySteps(result.steps),
        entryId: result.entryId,
        error: success ? undefined : this.legacyError(result) || '导入失败',
      });
    } catch (err: any) {
      if (!this.isCancelled(id)) {
        this.update(id, { status: 'failed', uploadProgress: null, error: err.message || '导入失败' });
      }
    }
  }

  private adaptLegacySteps(steps: ImportJob['steps']): UploadStage[] {
    return steps.map((s, i) => ({
      stage: LEGACY_STAGE_KEYS[i] ?? `step_${i + 1}`,
      status: s.status === 'failed' ? 'failed' : s.status === 'skipped' ? 'skipped' : 'success',
      ms: 0,
      detail: s.error || s.description || '',
    }));
  }

  private legacyError(result: ImportJob): string | undefined {
    return result.steps.find((s) => s.status === 'failed')?.error;
  }

  // ── Binary files: XHR upload → 202 {jobId} → poll /pipeline/jobs/:id ──
  private async uploadBinaryFile(id: string, file: File, targetSpaceId: string): Promise<void> {
    try {
      const jobId = await this.postFile(id, file, targetSpaceId);
      if (!jobId || this.isCancelled(id)) return;

      this.update(id, { status: 'running', uploadProgress: null });
      this.startPolling(id, jobId);
    } catch (err: any) {
      if (!this.isCancelled(id)) {
        this.update(id, { status: 'failed', uploadProgress: null, error: err.message || '上传失败' });
      }
    }
  }

  private postFile(id: string, file: File, targetSpaceId: string): Promise<string | null> {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append('file', file, file.name);
      formData.append(
        'metadata',
        JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, ''),
          entry_type: mapSpaceToEntryType(targetSpaceId),
          summary: `Auto-imported: ${file.name}`,
          visibility: 'internal',
          tags: ['auto-import'],
        }),
      );
      formData.append('chunkConfig', JSON.stringify({ strategy: 'markdown', chunkSize: 1024, overlap: 128 }));

      const xhr = new XMLHttpRequest();
      this.xhrs.set(id, xhr);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          this.update(id, { uploadProgress: Math.round((e.loaded / e.total) * 100) });
        }
      });

      xhr.addEventListener('load', () => {
        this.xhrs.delete(id);
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.jobId) {
            this.update(id, { serverJobId: data.jobId, uploadProgress: null });
            resolve(data.jobId);
          } else {
            this.update(id, {
              status: 'failed',
              uploadProgress: null,
              error: data.message || data.error || '上传失败',
            });
            resolve(null);
          }
        } catch {
          this.update(id, { status: 'failed', uploadProgress: null, error: '响应解析失败' });
          resolve(null);
        }
      });

      xhr.addEventListener('error', () => {
        this.xhrs.delete(id);
        this.update(id, { status: 'failed', uploadProgress: null, error: '网络错误，上传失败' });
        resolve(null);
      });

      xhr.addEventListener('abort', () => {
        this.xhrs.delete(id);
        this.update(id, { status: 'cancelled', uploadProgress: null, error: '上传已取消' });
        resolve(null);
      });

      xhr.open('POST', '/api/pipeline/import');
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
  }

  private startPolling(id: string, jobId: string): void {
    this.stopPolling(id);
    let failures = 0;

    const tick = async () => {
      const job = this.jobs.get(id);
      if (!job || job.status === 'cancelled') {
        this.pollTimers.delete(id);
        return;
      }

      try {
        const { job: serverJob } = await adminApi.getImportJobStatus(jobId);
        failures = 0;
        this.update(id, {
          status: serverJob.status,
          stages: this.adaptStages(serverJob.stages),
          entryId: serverJob.entryId,
          error: serverJob.error,
        });

        if (
          serverJob.status === 'success' ||
          serverJob.status === 'failed' ||
          serverJob.status === 'cancelled'
        ) {
          this.pollTimers.delete(id);
          return;
        }
      } catch {
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          this.update(id, { status: 'failed', error: '无法获取导入状态，请刷新后重试' });
          this.pollTimers.delete(id);
          return;
        }
      }

      const timer = setTimeout(tick, POLL_INTERVAL_MS);
      this.pollTimers.set(id, timer);
    };

    void tick();
  }

  private stopPolling(id: string): void {
    const timer = this.pollTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.pollTimers.delete(id);
    }
  }

  private adaptStages(raw: ServerImportJob['stages']): UploadStage[] {
    return raw.map((s) => ({ stage: s.stage, status: s.status, ms: s.ms, detail: s.detail }));
  }

  private isCancelled(id: string): boolean {
    const job = this.jobs.get(id);
    return !job || job.status === 'cancelled';
  }
}

export const uploadManager = new UploadManager();
