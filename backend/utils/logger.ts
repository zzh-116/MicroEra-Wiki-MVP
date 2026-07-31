// Structured Logger — module-scoped, level-filtered, error-persisted
// All levels write to console. ERROR level is additionally persisted to
// the run_logs database table via an async flush queue to avoid blocking
// the request path when the DB is slow or unreachable.
import { config } from '../config.js';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const MIN_LEVEL = LOG_LEVELS[config.logging.level as LogLevel] ?? LOG_LEVELS.info;

export interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

// ---- Flush queue ----
let flushQueue: LogEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
const FLUSH_INTERVAL_MS = 5000;
const FLUSH_BATCH_SIZE = 50;
const MAX_CONTEXT_SIZE = 8192; // 8 KB — prevent JSONB bloat

function truncateContext(ctx: Record<string, unknown>): Record<string, unknown> {
  try {
    const s = JSON.stringify(ctx);
    if (s.length <= MAX_CONTEXT_SIZE) return ctx;
    const truncated = JSON.parse(s.slice(0, MAX_CONTEXT_SIZE - 20));
    truncated['_truncated'] = true;
    return truncated;
  } catch {
    return { _serialization_error: true };
  }
}

/** Extract a useful stack trace, stripping the logger's own frames */
function captureStack(): string | undefined {
  try {
    const err = new Error();
    if (!err.stack) return undefined;
    const lines = err.stack.split('\n');
    // Skip "Error\n" + logger internal frames + this call
    const relevant = lines
      .filter((l) => !l.includes('logger.ts') && !l.includes('captureStack'))
      .slice(1);
    return relevant.join('\n').trim() || undefined;
  } catch {
    return undefined;
  }
}

async function flushToDb(): Promise<void> {
  if (flushQueue.length === 0) return;

  const batch = flushQueue.splice(0, FLUSH_BATCH_SIZE);
  try {
    const { logRepository } = await import('../repositories/log.repository.js');
    await logRepository.insertBatch(batch);
  } catch (err: any) {
    // Fire-and-forget: log to console but don't crash
    console.error(`[Logger] Flush failed (${batch.length} entries dropped): ${err.message}`);
    // Put them back so they're not lost on transient failures
    flushQueue.unshift(...batch);
  }
}

export function startLoggerFlush(): void {
  if (flushTimer) return;
  flushTimer = setInterval(flushToDb, FLUSH_INTERVAL_MS);
}

export function stopLoggerFlush(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

// Flush remaining entries on process exit
function gracefulFlush(): void {
  stopLoggerFlush();
  if (flushQueue.length > 0) {
    flushToDb().finally(() => process.exit(0));
  } else {
    process.exit(0);
  }
}
process.on('SIGTERM', gracefulFlush);
process.on('SIGINT', gracefulFlush);

// ---- Logger class ----
export class Logger {
  constructor(private module: string) {}

  debug(message: string, context?: Record<string, unknown>): void {
    if (MIN_LEVEL > LOG_LEVELS.debug) return;
    const ts = new Date().toISOString();
    console.debug(`[${ts}] [DEBUG] [${this.module}] ${message}`);
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (MIN_LEVEL > LOG_LEVELS.info) return;
    const ts = new Date().toISOString();
    console.log(`[${ts}] [INFO] [${this.module}] ${message}`);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (MIN_LEVEL > LOG_LEVELS.warn) return;
    const ts = new Date().toISOString();
    console.warn(`[${ts}] [WARN] [${this.module}] ${message}`);
  }

  error(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void {
    const ts = new Date().toISOString();
    let stack: string | undefined;
    let ctx: Record<string, unknown> | undefined;

    // Flexible overload: error(msg, err) or error(msg, ctx) or error(msg, err, ctx)
    if (errorOrContext instanceof Error) {
      stack = errorOrContext.stack;
      ctx = context;
    } else if (errorOrContext && typeof errorOrContext === 'object') {
      ctx = errorOrContext;
    }

    // Always log to console first (fast path)
    const stackSuffix = stack ? `\n${stack}` : '';
    console.error(`[${ts}] [ERROR] [${this.module}] ${message}${stackSuffix}`);

    // Persist to DB (fire-and-forget, non-blocking)
    const entry: LogEntry = {
      level: 'error',
      module: this.module,
      message,
      stack: stack || captureStack(),
      context: ctx ? truncateContext(ctx) : undefined,
      timestamp: ts,
    };
    flushQueue.push(entry);

    // Flush immediately if queue is large (backpressure)
    if (flushQueue.length >= FLUSH_BATCH_SIZE) {
      flushToDb();
    }
  }
}

/** Module-scoped logger cache — avoids creating duplicate instances */
const loggerCache = new Map<string, Logger>();

/**
 * Create or retrieve a module-scoped logger.
 * @example
 *   const logger = createLogger('Search');
 *   logger.info('Index built', { count: 42 });
 *   logger.error('Search failed', err, { query: 'foo' });
 */
export function createLogger(module: string): Logger {
  const cached = loggerCache.get(module);
  if (cached) return cached;
  const logger = new Logger(module);
  loggerCache.set(module, logger);
  return logger;
}

/** Default app-level logger */
export const logger = createLogger('App');
