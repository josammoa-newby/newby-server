import type { RequestHandler } from 'express';
import { AppError } from '../lib/AppError.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function rateLimit({ windowMs, max }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, _res, next) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요해요');
    }

    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }

    const bucket = buckets.get(userId) ?? { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(userId, bucket);

    if (bucket.count > max) {
      throw new AppError(429, 'RATE_LIMITED', '요청이 너무 많아요. 잠시 후 다시 시도해주세요');
    }
    next();
  };
}
