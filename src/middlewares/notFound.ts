import type { RequestHandler } from 'express';
import { sendError } from '../lib/response.js';

export const notFound: RequestHandler = (req, res) => {
  sendError(res, 404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`);
};
