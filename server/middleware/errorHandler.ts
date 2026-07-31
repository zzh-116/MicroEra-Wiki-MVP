// Global Express Error Handler Middleware
// Catches errors passed via next(err) or thrown in synchronous route handlers.
// Logs to the structured logger (console + DB) and returns a consistent JSON
// error response.
//
// IMPORTANT: Express 4 does NOT catch promise rejections automatically.
// Async route handlers MUST use try/catch or wrap with an async handler.
// Routes without try/catch will still result in unhandled rejections.
import type { Request, Response, NextFunction } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

export async function errorHandler(
  err: Error & { statusCode?: number; status?: number },
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const statusCode = err.statusCode || err.status || 500;

  // Lazy-load logger to avoid circular dependency at module load time
  const { createLogger } = await import('../../backend/utils/logger.js');
  const logger = createLogger('ErrorHandler');

  logger.error(
    `[${req.method} ${req.originalUrl}] ${err.message}`,
    err,
    {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      ip: req.ip || undefined,
      userId: (req as any).user?.userId || undefined,
      query: Object.keys(req.query || {}).length > 0 ? req.query : undefined,
    },
  );

  res.status(statusCode).json({
    error: 'INTERNAL_ERROR',
    message: isProduction ? '服务器内部错误' : err.message,
    timestamp: new Date().toISOString(),
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
