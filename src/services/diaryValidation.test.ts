import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../lib/AppError.js';
import { validateAnalyzeBody, validateDiaryId } from './diaryValidation.js';

const isValidation = (err: unknown) => err instanceof AppError && err.status === 400 && err.code === 'VALIDATION_ERROR';

describe('validateAnalyzeBody', () => {
  it('본문이 없거나 비어 있으면 force: false', () => {
    assert.deepEqual(validateAnalyzeBody(undefined), { force: false });
    assert.deepEqual(validateAnalyzeBody(null), { force: false });
    assert.deepEqual(validateAnalyzeBody({}), { force: false });
  });

  it('force 는 boolean 만 받는다', () => {
    assert.deepEqual(validateAnalyzeBody({ force: true }), { force: true });
    assert.deepEqual(validateAnalyzeBody({ force: false }), { force: false });
    for (const force of ['true', 1, 0, null, [], {}]) {
      assert.throws(() => validateAnalyzeBody({ force }), isValidation, String(force));
    }
  });

  it('객체가 아닌 본문은 400', () => {
    for (const body of ['x', 1, true, []]) assert.throws(() => validateAnalyzeBody(body), isValidation);
  });
});

describe('validateDiaryId', () => {
  it('uuid 가 아니면 404 DIARY_NOT_FOUND', () => {
    assert.equal(validateDiaryId('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111');
    assert.throws(
      () => validateDiaryId('abc'),
      (err: unknown) => err instanceof AppError && err.status === 404 && err.code === 'DIARY_NOT_FOUND',
    );
  });
});
