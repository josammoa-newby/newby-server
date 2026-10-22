import type { Response } from 'express';

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
}

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { success: true, data, error: null };
  res.status(status).json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiResponse<never> = {
    success: false,
    data: null,
    error: { code, message },
  };
  res.status(status).json(body);
}
