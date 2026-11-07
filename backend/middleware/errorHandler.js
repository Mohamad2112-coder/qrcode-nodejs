/**
 * Centralized error handler.
 * Maps known error types to HTTP status codes, never leaks stack traces in prod.
 */
export function errorHandler(err, _req, res, _next) {
  const statusCode = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  const response = {
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    ...(statusCode >= 500 && !isProd ? { stack: err.stack } : {}),
    ...(err.details ? { details: err.details } : {}),
  };

  console.error(`[ERROR_HANDLER] ${statusCode} - ${err.message}`, err.stack || '');

  res.status(statusCode).json(response);
}
