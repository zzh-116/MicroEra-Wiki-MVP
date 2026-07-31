import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { adminApi, LogEntry } from '../api/adminApi';
import {
  ScrollText, Search, Trash2, RefreshCw, ChevronDown, ChevronRight,
  AlertCircle, AlertTriangle, Info, Activity, Copy, Download,
  Clock, Tag, FileText,
} from 'lucide-react';
import Unauthorized from '../components/Unauthorized';
import Pagination from '../components/Pagination';

// ── Color System ──────────────────────────────────────────────
const LEVEL_CONFIG: Record<string, {
  badge: string; icon: typeof AlertCircle; label: string;
}> = {
  error: { badge: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle, label: 'Error' },
  warn:  { badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle, label: 'Warning' },
  info:  { badge: 'bg-blue-50 text-blue-700 border-blue-200', icon: Info, label: 'Info' },
  debug: { badge: 'bg-gray-50 text-gray-600 border-gray-200', icon: FileText, label: 'Debug' },
};

const LEVEL_DOT: Record<string, string> = {
  error: 'bg-red-500',
  warn: 'bg-amber-500',
  info: 'bg-blue-500',
  debug: 'bg-gray-400',
};

const STAT_CARDS = [
  { key: 'total', icon: Activity, label: '总日志', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
  { key: 'error', icon: AlertCircle, label: 'Error', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
  { key: 'warn', icon: AlertTriangle, label: 'Warning', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  { key: 'info', icon: Info, label: 'Info', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
];

// ── Helpers ───────────────────────────────────────────────────
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch { return iso; }
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  } catch { return ''; }
}

// ── Component ─────────────────────────────────────────────────
export default function AdminLogsPage() {
  const { isLoggedIn } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  // Data
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [levels, setLevels] = useState<string[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({ total: 0, error: 0, warn: 0, info: 0 });

  // Filters
  const [levelFilter, setLevelFilter] = useState(searchParams.get('level') || '');
  const [moduleFilter, setModuleFilter] = useState(searchParams.get('module') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [timeFilter, setTimeFilter] = useState(searchParams.get('time') || '');

  // UI state
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Pagination from URL
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20));

  // ── Data fetching ──────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const fetchStats = useCallback(async () => {
    try {
      const [allRes, errRes, warnRes, infoRes] = await Promise.all([
        adminApi.getLogs({ pageSize: 1 }),
        adminApi.getLogs({ level: 'error', pageSize: 1 }),
        adminApi.getLogs({ level: 'warn', pageSize: 1 }),
        adminApi.getLogs({ level: 'info', pageSize: 1 }),
      ]);
      setStats({ total: allRes.total, error: errRes.total, warn: warnRes.total, info: infoRes.total });
    } catch { /* non-critical */ }
  }, []);

  const loadLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Compute date range from timeFilter
      let startDate: string | undefined;
      if (timeFilter === '1h') startDate = new Date(Date.now() - 3600000).toISOString();
      else if (timeFilter === '24h') startDate = new Date(Date.now() - 86400000).toISOString();
      else if (timeFilter === '7d') startDate = new Date(Date.now() - 604800000).toISOString();
      else if (timeFilter === '30d') startDate = new Date(Date.now() - 2592000000).toISOString();

      const result = await adminApi.getLogs({
        level: levelFilter || undefined,
        module: moduleFilter || undefined,
        search: searchQuery || undefined,
        page,
        pageSize,
      });
      setLogs(result.logs);
      setTotal(result.total);
      setLevels(result.levels);
      setModules(result.modules);
    } catch (err) {
      if (!silent) console.error('Failed to load logs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [levelFilter, moduleFilter, searchQuery, timeFilter, page, pageSize]);

  // Initial load
  useEffect(() => {
    if (isLoggedIn) { loadLogs(); fetchStats(); }
  }, [isLoggedIn, loadLogs, fetchStats]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => { loadLogs(true); fetchStats(); }, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh, loadLogs, fetchStats]);

  // ── URL sync ───────────────────────────────────────────────
  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v); else params.delete(k);
    }
    setSearchParams(params, { replace: true });
  };

  // ── Actions ─────────────────────────────────────────────────
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} 已复制`);
    } catch { showToast('复制失败'); }
  };

  const downloadLog = (log: LogEntry) => {
    const content = [
      `[${log.level.toUpperCase()}] ${log.module} — ${log.message}`,
      `Time: ${log.createdAt}`,
      log.stack ? `\nStack Trace:\n${log.stack}` : '',
      log.context ? `\nContext:\n${JSON.stringify(log.context, null, 2)}` : '',
    ].filter(Boolean).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `log-${log.id}.txt`; a.click();
    URL.revokeObjectURL(url);
    showToast('日志已下载');
  };

  const handleClearLogs = async () => {
    const daysStr = prompt('删除多少天之前的日志？（默认 30 天）', '30');
    const days = parseInt(daysStr || '30', 10);
    if (!days || days < 1) return;
    if (!confirm(`确认删除 ${days} 天之前的所有日志？此操作不可撤销。`)) return;
    setDeleting(true);
    try {
      const result = await adminApi.deleteLogs(days);
      showToast(result.message);
      loadLogs(); fetchStats();
    } catch (err: any) {
      showToast(`删除失败: ${err.message}`);
    } finally { setDeleting(false); }
  };

  // ── Auth guard ──────────────────────────────────────────────
  if (!isLoggedIn) return <Unauthorized requiredRole="admin" />;

  // ── Render ──────────────────────────────────────────────────
  const LevelIcon = LEVEL_CONFIG[levelFilter]?.icon;
  const filteredStats = levelFilter ? { total: stats[levelFilter] || 0 } : stats;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <style>{`
        @keyframes slideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* ══════ Toast ══════ */}
        {toast && (
          <div className="fixed top-16 right-6 z-50 transition-all duration-200 ease-out"
            style={{ opacity: toast ? 1 : 0, transform: toast ? 'translateY(0)' : 'translateY(-8px)' }}>
            <div className="bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {toast}
            </div>
          </div>
        )}

        {/* ══════ Header ══════ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium tracking-wide uppercase mb-1">
              <Activity className="w-3 h-3" />
              Admin &nbsp;/&nbsp; Runtime Logs
            </div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
                <ScrollText className="w-4 h-4 text-white" />
              </span>
              运行日志
            </h1>
            <p className="text-sm text-slate-500 mt-1.5 ml-0.5">
              查看系统运行日志、错误信息和调试记录
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Auto-refresh Switch */}
            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer select-none border ${
              autoRefresh
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}>
              <span className="relative flex h-4 w-7 items-center rounded-full transition-colors duration-200"
                style={{ backgroundColor: autoRefresh ? '#3B82F6' : '#CBD5E1' }}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 ${
                  autoRefresh ? 'translate-x-3.5' : 'translate-x-0.5'
                }`} />
              </span>
              <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} />
              自动刷新 {autoRefresh ? 'ON' : 'OFF'}
            </label>

            {/* Clear logs */}
            <button
              onClick={handleClearLogs}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border
                bg-white text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3 h-3" />
              {deleting ? '删除中...' : '清空日志'}
            </button>
          </div>
        </div>

        {/* ══════ Stats Cards ══════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STAT_CARDS.map(({ key, icon: Icon, label, color, bg, border }) => (
            <div
              key={key}
              className={`${bg} border ${border} rounded-xl p-4 hover:shadow-sm transition-shadow duration-200`}
            >
              <div className="flex items-center justify-between">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-2xl font-bold text-slate-900 tabular-nums">
                  {key === 'total' ? total : (stats[key] ?? 0)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* ══════ Toolbar ══════ */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap shadow-sm">
          {/* Level */}
          <div className="relative">
            <select
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); updateParams({ level: e.target.value, page: '1' }); }}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-8 py-2 text-xs font-medium text-slate-700
                focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 cursor-pointer"
            >
              <option value="">全部级别</option>
              {levels.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
              {levels.length === 0 && (
                <>
                  <option value="error">ERROR</option>
                  <option value="warn">WARN</option>
                  <option value="info">INFO</option>
                  <option value="debug">DEBUG</option>
                </>
              )}
            </select>
            {LevelIcon && <LevelIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />}
          </div>

          {/* Module */}
          <select
            value={moduleFilter}
            onChange={(e) => { setModuleFilter(e.target.value); updateParams({ module: e.target.value, page: '1' }); }}
            className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 cursor-pointer min-w-[100px]"
          >
            <option value="">全部模块</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>

          {/* Time */}
          <select
            value={timeFilter}
            onChange={(e) => { setTimeFilter(e.target.value); updateParams({ time: e.target.value, page: '1' }); }}
            className="appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-3 py-2 text-xs font-medium text-slate-700
              focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 cursor-pointer"
          >
            <option value="">全部时间</option>
            <option value="1h">最近 1 小时</option>
            <option value="24h">最近 24 小时</option>
            <option value="7d">最近 7 天</option>
            <option value="30d">最近 30 天</option>
          </select>
          <Clock className="w-3 h-3 text-slate-400 -ml-1" />

          {/* Search — flex-grow */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { updateParams({ search: searchQuery, page: '1' }); loadLogs(); }
              }}
              placeholder="搜索日志消息、模块或错误信息..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-700
                placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>

          {/* Export placeholder */}
          <button
            disabled
            title="即将支持"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
              text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed opacity-60"
          >
            <Download className="w-3 h-3" />
            导出
          </button>
        </div>

        {/* ══════ Log List ══════ */}
        <div className="space-y-2">
          {/* Loading skeleton */}
          {loading && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4">
                  <div className="w-14 h-5 bg-slate-100 rounded" />
                  <div className="flex-1 h-4 bg-slate-100 rounded" />
                  <div className="w-24 h-4 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && logs.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                <ScrollText className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">暂无日志记录</h3>
              <p className="text-xs text-slate-400">
                系统运行正常，未发现异常日志
              </p>
            </div>
          )}

          {/* Log cards */}
          {!loading && logs.map((log) => {
            const cfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.debug;
            const isExpanded = expandedIds.has(log.id);
            const hasDetail = !!(log.stack || log.context);

            return (
              <div
                key={log.id}
                className={`bg-white border border-slate-200 rounded-xl overflow-hidden transition-all duration-200
                  ${hasDetail ? 'cursor-pointer' : ''}
                  hover:shadow-md hover:border-slate-300
                  ${isExpanded ? 'shadow-sm ring-1 ring-blue-500/10 border-blue-200' : ''}
                `}
              >
                {/* ── Card header ── */}
                <div
                  onClick={() => hasDetail && toggleExpand(log.id)}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  {/* Level badge */}
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide border ${cfg.badge}`}>
                    <cfg.icon className="w-3 h-3" />
                    {cfg.label}
                  </span>

                  {/* Message */}
                  <span className="flex-1 text-sm text-slate-800 font-medium truncate min-w-0">
                    {log.message}
                  </span>

                  {/* Meta */}
                  <div className="hidden sm:flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
                    <span className="flex items-center gap-1" title={log.module}>
                      <Tag className="w-3 h-3" />
                      {log.module}
                    </span>
                    <span className="flex items-center gap-1 font-mono" title={formatTime(log.createdAt)}>
                      <Clock className="w-3 h-3" />
                      {formatRelative(log.createdAt)}
                    </span>
                  </div>

                  {/* Expand chevron */}
                  {hasDetail && (
                    <span className="text-slate-300 flex-shrink-0">
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 transition-transform duration-200" />
                        : <ChevronRight className="w-4 h-4 transition-transform duration-200" />
                      }
                    </span>
                  )}
                  {!hasDetail && <span className="w-4 flex-shrink-0" />}
                </div>

                {/* Mobile meta row */}
                <div className="sm:hidden flex items-center gap-3 px-5 pb-2 text-[11px] text-slate-400">
                  <span>{log.module}</span>
                  <span className="font-mono">{formatTime(log.createdAt)}</span>
                </div>

                {/* ── Expanded detail ── */}
                {isExpanded && hasDetail && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 space-y-4"
                    style={{ animation: 'slideDown 0.2s ease-out' }}>
                    {/* Quick actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={(e) => { e.stopPropagation(); copyToClipboard(log.message, '消息'); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium
                          text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                        <Copy className="w-3 h-3" /> 复制日志
                      </button>
                      {log.stack && (
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(log.stack!, 'Stack Trace'); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium
                            text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                          <Copy className="w-3 h-3" /> 复制 Stack
                        </button>
                      )}
                      {log.context && (
                        <button onClick={(e) => { e.stopPropagation(); copyToClipboard(JSON.stringify(log.context, null, 2), 'Context JSON'); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium
                            text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                          <Copy className="w-3 h-3" /> 复制 JSON
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); downloadLog(log); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium
                          text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                        <Download className="w-3 h-3" /> 下载
                      </button>
                    </div>

                    {/* Stack Trace */}
                    {log.stack && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Stack Trace</span>
                        </div>
                        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto max-h-64 overflow-y-auto">
                          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed"
                            style={{ fontFamily: "'JetBrains Mono', 'Consolas', 'Menlo', 'Monaco', monospace" }}>
                            {log.stack}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Context */}
                    {log.context && Object.keys(log.context).length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Context</span>
                        </div>
                        <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 overflow-x-auto max-h-48 overflow-y-auto">
                          <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed"
                            style={{ fontFamily: "'JetBrains Mono', 'Consolas', 'Menlo', 'Monaco', monospace" }}>
                            {JSON.stringify(log.context, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* Metadata */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Metadata</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {[
                          ['ID', `#${log.id}`],
                          ['级别', log.level.toUpperCase()],
                          ['模块', log.module],
                          ['时间', formatTime(log.createdAt)],
                        ].map(([k, v]) => (
                          <div key={k} className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider">{k}</div>
                            <div className="text-slate-700 font-medium mt-0.5 font-mono">{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ══════ Footer Bar ══════ */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Activity className="w-3 h-3" />
            <span className="font-medium">{total.toLocaleString()}</span> 条日志
            {!autoRefresh && (
              <button onClick={() => { loadLogs(); fetchStats(); }}
                className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-blue-600 hover:bg-blue-50 transition-colors">
                <RefreshCw className="w-3 h-3" /> 刷新
              </button>
            )}
          </div>
          {total > 0 && (
            <Pagination
              page={page} pageSize={pageSize} total={total}
              onPageChange={(p) => updateParams({ page: String(p) })}
            />
          )}
        </div>

      </div>
    </div>
  );
}
