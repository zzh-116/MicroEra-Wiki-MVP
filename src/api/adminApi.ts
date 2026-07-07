import { getToken } from './client';

export interface ImportJobStep {
  id: number;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: string;
}

export interface ImportJob {
  id: string;
  filename: string;
  fileSize: string;
  targetType: string;
  currentStepIndex: number;
  status: 'pending' | 'running' | 'success' | 'failed';
  steps: ImportJobStep[];
  startedAt: string;
  entryId?: number;
}

const activeJobs: ImportJob[] = [];
const API_BASE = '/api';

/** Map space IDs from the UI dropdown to valid backend entry types */
function mapSpaceToEntryType(spaceId: string): string {
  const map: Record<string, string> = {
    's-sandbox': 'tech',
    's-papers': 'tech',
    's-data': 'data_item',
    's-tech': 'tech',
    's-business': 'asset',
    's-template': 'asset',
    's-product': 'product',
  };
  return map[spaceId] || 'tech';
}

export const adminApi = {
  async getImportJobs(): Promise<ImportJob[]> {
    return Promise.resolve(activeJobs);
  },

  /**
   * Upload a file through the full pipeline.
   * For PDF/binary files: uses multipart form upload
   * For text files: reads content and sends via JSON
   */
  async startImportJob(
    file: { name: string; size: number; data?: ArrayBuffer | string },
    targetType: string,
  ): Promise<ImportJob> {
    const entryType = mapSpaceToEntryType(targetType);
    const sizeStr = file.size > 0
      ? file.size > 1024 * 1024
        ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
        : (file.size / 1024).toFixed(1) + ' KB'
      : 'Unknown';

    const steps: ImportJobStep[] = [
      { id: 1, name: '解析文档', description: '将源文件转换为统一 Markdown 格式', status: 'pending' },
      { id: 2, name: '智能分块', description: '对文本进行语义分块 (Chunking)', status: 'pending' },
      { id: 3, name: '向量嵌入', description: '通过 Ollama bge-m3 生成 Embedding 向量', status: 'pending' },
      { id: 4, name: '存入向量库', description: '写入向量存储（Milvus / 内存）', status: 'pending' },
      { id: 5, name: '激活 RAG 服务', description: '开放该条目的语义检索与问答接口', status: 'pending' },
    ];

    const job: ImportJob = {
      id: `job-${Date.now()}`,
      filename: file.name,
      fileSize: sizeStr,
      targetType,
      currentStepIndex: 0,
      status: 'pending',
      steps,
      startedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };

    activeJobs.unshift(job);

    try {
      job.status = 'running';
      job.steps[0].status = 'running';
      job.currentStepIndex = 0;

      const isTextFile = /\.(md|txt|csv|json|xml|yaml|yml)$/i.test(file.name);

      let result: any;

      if (isTextFile && typeof file.data === 'string') {
        // Text files: send content directly
        result = await fetch(`${API_BASE}/pipeline/import/string`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
          body: JSON.stringify({
            content: file.data,
            fileName: file.name,
            metadata: {
              title: file.name.replace(/\.[^.]+$/, ''),
              entry_type: entryType,
              summary: `Auto-imported: ${file.name}`,
              visibility: 'internal',
              tags: ['auto-import'],
            },
            chunkConfig: { strategy: 'markdown', chunkSize: 1024, overlap: 128 },
          }),
        });
      } else {
        // Binary files (PDF, DOCX, etc.): use multipart form upload
        const formData = new FormData();
        const blob = file.data instanceof ArrayBuffer
          ? new Blob([file.data])
          : new Blob([file.data || ''], { type: 'application/octet-stream' });
        formData.append('file', blob, file.name);
        formData.append('metadata', JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, ''),
          entry_type: entryType,
          summary: `Auto-imported: ${file.name}`,
          visibility: 'internal',
          tags: ['auto-import'],
        }));
        formData.append('chunkConfig', JSON.stringify({ strategy: 'markdown', chunkSize: 1024, overlap: 128 }));

        result = await fetch(`${API_BASE}/pipeline/import`, {
          method: 'POST',
          body: formData,
        });
      }

      const data = await result.json();

      if (result.ok && data.success) {
        job.steps.forEach((s) => { s.status = 'success'; });
        job.status = 'success';
        job.currentStepIndex = job.steps.length - 1;
        job.entryId = data.entryId;
      } else {
        job.status = 'failed';
        const step = job.steps[job.currentStepIndex];
        if (step && step.status === 'running') {
          step.status = 'failed';
          step.error = data.message || data.error || 'Import failed';
        }
      }
    } catch (err: any) {
      job.status = 'failed';
      const step = job.steps[job.currentStepIndex];
      if (step && step.status === 'running') {
        step.status = 'failed';
        step.error = err.message || 'Network error';
      }
    }

    return job;
  },

  tickJob(jobId: string): ImportJob | null {
    const job = activeJobs.find((j) => j.id === jobId);
    if (!job) return null;
    return { ...job };
  },
};
