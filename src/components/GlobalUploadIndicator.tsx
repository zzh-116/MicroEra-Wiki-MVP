// GlobalUploadIndicator — floating, page-agnostic import progress.
// Subscribes to the global UploadManager so users see import progress (and can
// jump to the imported entry) from any page, not just the import page.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadManager } from '../services/uploadManager';
import type { UploadJob } from '../services/uploadManager';
import { CheckCircle, AlertCircle, X, ArrowUpRight, RefreshCw } from 'lucide-react';

const AUTO_DISMISS_MS = 6000;

function jobProgress(job: UploadJob): { pct: number | null; label: string } {
  switch (job.status) {
    case 'uploading':
      return { pct: job.uploadProgress ?? 0, label: '上传中' };
    case 'pending':
      return { pct: null, label: '排队中' };
    case 'running':
      return { pct: Math.min(Math.round((job.stages.length / 3) * 100), 100), label: '处理中' };
    default:
      return { pct: null, label: '' };
  }
}

export default function GlobalUploadIndicator() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const dismissedRef = useRef<Set<string>>(new Set());
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();

    const sync = () => {
      const visible = uploadManager.getJobs().filter((j) => {
        if (j.status === 'uploading' || j.status === 'pending' || j.status === 'running') {
          return true;
        }
        // Terminal jobs stay visible until dismissed or auto-dismissed.
        return !dismissedRef.current.has(j.id);
      });
      setJobs(visible);

      // Auto-dismiss terminal jobs after a short delay.
      for (const j of visible) {
        const terminal =
          j.status === 'success' || j.status === 'failed' || j.status === 'cancelled';
        if (terminal && !timers.has(j.id)) {
          timers.set(
            j.id,
            setTimeout(() => {
              dismissedRef.current.add(j.id);
              timers.delete(j.id);
              sync();
            }, AUTO_DISMISS_MS),
          );
        }
      }
    };

    syncRef.current = sync;
    const unsubscribe = uploadManager.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const dismiss = (id: string) => {
    dismissedRef.current.add(id);
    syncRef.current();
  };

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {jobs.map((job) => {
        const { pct, label } = jobProgress(job);
        const isSuccess = job.status === 'success';
        const isFailure = job.status === 'failed' || job.status === 'cancelled';
        const isActive =
          job.status === 'uploading' || job.status === 'pending' || job.status === 'running';

        return (
          <div
            key={job.id}
            className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 animate-fade-in"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2.5">
              {/* Icon */}
              <span className="flex-shrink-0 mt-0.5" aria-hidden="true">
                {isSuccess && <CheckCircle className="w-4 h-4 text-green-600" />}
                {isFailure && <AlertCircle className="w-4 h-4 text-red-600" />}
                {isActive && <RefreshCw className="w-4 h-4 text-brand animate-spin" />}
              </span>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-900 truncate font-mono" title={job.filename}>
                    {job.filename}
                  </p>
                  {isActive ? (
                    <button
                      onClick={() => uploadManager.cancelUpload(job.id)}
                      className="flex-shrink-0 text-[11px] font-medium text-gray-400 hover:text-brand transition-colors"
                    >
                      取消
                    </button>
                  ) : (
                    <button
                      onClick={() => dismiss(job.id)}
                      className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                      aria-label="关闭"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-gray-500 mt-0.5">
                  {isSuccess
                    ? '导入完成'
                    : isFailure
                      ? job.status === 'cancelled'
                        ? '已取消'
                        : '导入失败'
                      : label}
                </p>

                {isActive && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand rounded-full transition-all duration-300 ease-out"
                        style={{ width: pct == null ? '0%' : `${pct}%` }}
                      />
                    </div>
                    {job.status === 'pending' && (
                      <p className="text-[10px] text-gray-400 mt-1">等待空闲处理槽...</p>
                    )}
                  </div>
                )}

                {isFailure && job.error && (
                  <p className="text-[11px] text-red-600 mt-1 line-clamp-2">{job.error}</p>
                )}

                {isSuccess && job.entryId && (
                  <button
                    onClick={() => navigate(`/entry/${job.entryId}`)}
                    className="inline-flex items-center gap-1 text-[11px] text-link hover:underline mt-1"
                  >
                    查看条目
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
