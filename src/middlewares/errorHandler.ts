import type { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/AppError.js';
import { sendError } from '../lib/response.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  // body-parser 등이 던지는 4xx 에러
  const status = (err as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    sendError(res, status, 'BAD_REQUEST', 'Bad request');
    return;
  }
  console.error(err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
};
