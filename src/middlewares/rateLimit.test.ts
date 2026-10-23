import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, Response } from 'express';
import { AppError } from '../lib/AppError.js';
import { rateLimit } from './rateLimit.js';

const req = (id?: string) => ({ user: id ? { id } : undefined }) as unknown as Request;
const res = {} as Response;

function run(limiter: ReturnType<typeof rateLimit>, id?: string): 'next' | AppError {
  let result: 'next' | AppError = 'next';
  try {
    limiter(req(id), res, () => {});
  } catch (err) {
    result = err as AppError;
  }
  return result;
}

describe('rateLimit', () => {
  it('max 회까지 통과하고 다음은 429 RATE_LIMITED', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 10 });
    for (let i = 0; i < 10; i++) assert.equal(run(limiter, 'u1'), 'next');
    const blocked = run(limiter, 'u1');
    assert.ok(blocked instanceof AppError);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.code, 'RATE_LIMITED');
  });

  it('사용자별로 따로 센다', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    assert.equal(run(limiter, 'a'), 'next');
    assert.ok(run(limiter, 'a') instanceof AppError);
    assert.equal(run(limiter, 'b'), 'next');
  });

  it('윈도우가 지나면 다시 허용한다', async () => {
    const limiter = rateLimit({ windowMs: 30, max: 1 });
    assert.equal(run(limiter, 'a'), 'next');
    assert.ok(run(limiter, 'a') instanceof AppError);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(run(limiter, 'a'), 'next');
  });

  it('로그인 정보(req.user)가 없으면 401', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    const result = run(limiter);
    assert.ok(result instanceof AppError);
    assert.equal(result.status, 401);
  });
});
