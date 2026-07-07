import { post, get } from './client';

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
}

const activeJobs: ImportJob[] = [];

export const adminApi = {
  async getImportJobs(): Promise<ImportJob[]> {
    return Promise.resolve(activeJobs);
  },

  async startImportJob(
    file: { name: string; size: number },
    targetType: string,
  ): Promise<ImportJob> {
    const sizeInMb = file.size > 0
      ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
      : '45 KB';

    const steps: ImportJobStep[] = [
      { id: 1, name: '解析文档', description: '将源文件转换为统一 Markdown 格式', status: 'pending' },
      { id: 2, name: '智能分块', description: '对文本进行语义分块 (Chunking)', status: 'pending' },
      { id: 3, name: '向量嵌入', description: '通过 Ollama bge-m3 生成 Embedding 向量', status: 'pending' },
      { id: 4, name: '存入向量库', description: '写入 Milvus / 内存向量存储', status: 'pending' },
      { id: 5, name: '激活 RAG 服务', description: '开放该条目的语义检索与问答接口', status: 'pending' },
    ];

    const job: ImportJob = {
      id: `job-${Date.now()}`,
      filename: file.name,
      fileSize: sizeInMb,
      targetType,
      currentStepIndex: 0,
      status: 'pending',
      steps,
      startedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };

    activeJobs.unshift(job);

    // Try calling the real pipeline import
    try {
      job.status = 'running';
      job.steps[0].status = 'running';
      job.currentStepIndex = 0;

      await post('/pipeline/import/string', {
        content: `# ${file.name}\n\nImported file content placeholder.`,
        fileName: file.name,
        metadata: {
          title: file.name,
          entry_type: targetType || 'tech',
          summary: `Auto-imported: ${file.name}`,
          visibility: 'internal',
          tags: ['auto-import'],
        },
        skipEmbedding: false,
      });

      // Mark all steps as success
      job.steps.forEach((s) => { s.status = 'success'; });
      job.status = 'success';
      job.currentStepIndex = job.steps.length - 1;
    } catch (err: any) {
      job.status = 'failed';
      const currentStep = job.steps[job.currentStepIndex];
      if (currentStep && currentStep.status === 'running') {
        currentStep.status = 'failed';
        currentStep.error = err.message || 'Import failed';
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
