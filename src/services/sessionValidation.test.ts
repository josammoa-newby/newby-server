import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../lib/AppError.js';
import { MAX_MESSAGE_LENGTH, validateCreateSession, validateMessage } from './sessionValidation.js';

function rejects(fn: () => unknown, status: number, code: string) {
  assert.throws(fn, (err: unknown) => err instanceof AppError && err.status === status && err.code === code);
}

describe('validateMessage', () => {
  it('trim 하고 1~1000자만 허용', () => {
    assert.deepEqual(validateMessage({ text: '  안녕  ' }), { text: '안녕' });
    assert.equal(validateMessage({ text: 'a' }).text, 'a');
    assert.equal(MAX_MESSAGE_LENGTH, 1000);
    assert.equal(validateMessage({ text: 'a'.repeat(1000) }).text.length, 1000);
    // trim 후 길이로 판단한다
    assert.equal(validateMessage({ text: `  ${'a'.repeat(1000)}  ` }).text.length, 1000);
    rejects(() => validateMessage({ text: 'a'.repeat(1001) }), 400, 'VALIDATION_ERROR');
  });

  it('비어 있거나 공백뿐이거나 문자열이 아니면 400', () => {
    for (const body of [{}, { text: '' }, { text: '   ' }, { text: 5 }, { text: null }, { text: ['a'] }]) {
      rejects(() => validateMessage(body), 400, 'VALIDATION_ERROR');
    }
    for (const body of [undefined, null, [], 'text']) rejects(() => validateMessage(body), 400, 'VALIDATION_ERROR');
  });
});

describe('validateCreateSession', () => {
  it('uuid 형식의 supervisorId 만 통과', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    assert.deepEqual(validateCreateSession({ supervisorId: ` ${id} ` }), { supervisorId: id });
  });

  it('없거나 문자열이 아니면 400, 형식이 틀리면 없는 상사와 같은 404', () => {
    rejects(() => validateCreateSession({}), 400, 'VALIDATION_ERROR');
    rejects(() => validateCreateSession({ supervisorId: 5 }), 400, 'VALIDATION_ERROR');
    rejects(() => validateCreateSession({ supervisorId: '  ' }), 400, 'VALIDATION_ERROR');
    rejects(() => validateCreateSession(undefined), 400, 'VALIDATION_ERROR');
    rejects(() => validateCreateSession({ supervisorId: 'not-a-uuid' }), 404, 'SUPERVISOR_NOT_FOUND');
  });
});
