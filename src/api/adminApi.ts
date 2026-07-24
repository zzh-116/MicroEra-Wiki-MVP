import { getToken } from './client';

export interface ImportJobStep {
  id: number;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
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

/** Backend stage → frontend step mapping */
const STAGE_TO_STEP: Record<string, number> = {
  parse: 0,
  chunk: 1,
  embed: 2,
};

const activeJobs: ImportJob[] = [];
const API_BASE = '/api';

function mapSpaceToEntryType(spaceId: string): string {
  const map: Record<string, string> = {
    's-sandbox': 'sandbox_project', 's-papers': 'academic_paper', 's-data': 'data_standard',
    's-tech': 'tech_doc', 's-business': 'business_material', 's-template': 'template',
    's-product': 'tech_doc',
    's-patent': 'patent',
    's-handwritten': 'handwritten_note',
  };
  return map[spaceId] || 'tech';
}

/** Generate non-empty sample content for quick-upload files */
function sampleContent(fileName: string): { data: string; isText: boolean } {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      // Minimal valid PDF binary — parser requires buffer input for PDF
      return { data: '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Sample PDF Document) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n368\n%%EOF', isText: false };
    case 'md':
    case 'txt':
      return { data: `# Sample Document\n\n## Auto-generated for Pipeline Testing\n\nThis is sample content for verifying the MarkItDown ingestion pipeline.\n\n### Key Points\n\n- Point A: Quantum computing simulation results\n- Point B: Material science DFT calculations\n- Point C: AI-driven experimental data analysis\n\n> This document was auto-generated for ingestion testing purposes.`, isText: true };
    default:
      // All other extensions: send as markdown text
      return { data: `# ${fileName}\n\nAuto-generated sample content for ingestion testing.\n\n## Overview\n\nTest document for pipeline verification.`, isText: true };
  }
}

export const adminApi = {
  async getImportJobs(): Promise<ImportJob[]> {
    return Promise.resolve([...activeJobs]);
  },

  async startImportJob(
    file: { name: string; size: number; data?: ArrayBuffer | string },
    targetType: string,
  ): Promise<ImportJob> {
    const entryType = mapSpaceToEntryType(targetType);
    const sizeStr = file.size > 0
      ? file.size > 1024 * 1024 ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
        : (file.size / 1024).toFixed(1) + ' KB'
      : 'Unknown';

    const steps: ImportJobStep[] = [
      { id: 1, name: '解析文档', description: 'MarkItDown → 统一 Markdown', status: 'pending' },
      { id: 2, name: '智能分块', description: '语义分块 + 元数据提取', status: 'pending' },
      { id: 3, name: '向量嵌入', description: 'BGE-M3 → pgvector 存储', status: 'pending' },
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

      // Determine content: use provided data or generate sample
      const hasContent = file.data && (
        (typeof file.data === 'string' && file.data.length > 0) ||
        (file.data instanceof ArrayBuffer && file.data.byteLength > 0)
      );

      let result: Response;
      let isText = /\.(md|txt|csv|json|xml|yaml|yml|log|html|htm|adoc|asciidoc)$/i.test(file.name);
      let textContent: string;

      if (hasContent && typeof file.data === 'string') {
        // Text content from file.text()
        textContent = file.data;
      } else if (hasContent && file.data instanceof ArrayBuffer) {
        // Binary content from file.arrayBuffer() — keep as ArrayBuffer
        textContent = '';
        isText = false;
      } else {
        // No real content — generate sample for demo
        const sample = sampleContent(file.name);
        textContent = sample.data;
        isText = sample.isText;
      }

      if (isText) {
        result = await fetch(`${API_BASE}/pipeline/import/string`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
          body: JSON.stringify({
            content: textContent,
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
        // Binary file: use the original ArrayBuffer from the File object
        const blob = file.data instanceof ArrayBuffer
          ? new Blob([file.data], { type: 'application/octet-stream' })
          : new Blob([textContent], { type: 'application/octet-stream' });

        const formData = new FormData();
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

      // Map backend stages[] to frontend steps[]
      if (data.stages && Array.isArray(data.stages)) {
        for (const stage of data.stages) {
          const stepIdx = STAGE_TO_STEP[stage.stage];
          if (stepIdx !== undefined && stepIdx < job.steps.length) {
            job.steps[stepIdx].status = stage.status;
            if (stage.status === 'failed') {
              job.steps[stepIdx].error = stage.detail || 'Unknown error';
            }
            if (stage.status === 'running') {
              job.currentStepIndex = stepIdx;
            }
          }
        }
      }

      // Determine overall status
      if (data.success) {
        job.status = 'success';
        job.currentStepIndex = job.steps.length - 1;
        job.entryId = data.entryId;
        // Mark any remaining pending steps as success
        for (const step of job.steps) {
          if (step.status === 'pending') step.status = 'success';
        }
      } else {
        // Find which stage failed
        const failedStage = data.stages?.find((s: any) => s.status === 'failed');
        if (failedStage && failedStage.detail) {
          // Already mapped in the loop above
          job.status = 'failed';
        } else if (data.errors && data.errors.length > 0) {
          job.status = 'failed';
          job.steps[0].status = 'failed';
          job.steps[0].error = data.errors.join('; ');
        } else {
          job.status = 'failed';
          job.steps[0].status = 'failed';
          job.steps[0].error = data.message || data.error || 'Import failed';
        }
      }
    } catch (err: any) {
      console.error('[ImportJob] Fatal error:', err);
      job.status = 'failed';
      // Find the currently running step and mark it failed
      const runningStep = job.steps.find((s) => s.status === 'running');
      if (runningStep) {
        runningStep.status = 'failed';
        runningStep.error = err.message || 'Network error';
      } else {
        job.steps[0].status = 'failed';
        job.steps[0].error = err.message || 'Network error';
      }
    }

    return job;
  },

  tickJob(jobId: string): ImportJob | null {
    const job = activeJobs.find((j) => j.id === jobId);
    return job ? { ...job } : null;
  },
};
