import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../lib/AppError.js';
import { validateProfileUpdate } from './authValidation.js';

function rejects(body: unknown, messagePart?: string) {
  assert.throws(
    () => validateProfileUpdate(body),
    (err: unknown) =>
      err instanceof AppError &&
      err.status === 400 &&
      err.code === 'VALIDATION_ERROR' &&
      (messagePart === undefined || err.message.includes(messagePart)),
  );
}

describe('validateProfileUpdate', () => {
  it('허용 필드만 통과하고 보낸 필드만 돌려준다', () => {
    assert.deepEqual(validateProfileUpdate({ name: '김뉴비' }), { name: '김뉴비' });
    assert.deepEqual(
      validateProfileUpdate({
        name: '김뉴비',
        job: 'developer',
        workStyle: 'planner',
        bossStyle: 'supportive',
        marketingAgreed: true,
      }),
      { name: '김뉴비', job: 'developer', workStyle: 'planner', bossStyle: 'supportive', marketingAgreed: true },
    );
    assert.deepEqual(validateProfileUpdate({ marketingAgreed: false }), { marketingAgreed: false });
  });

  it('금지 필드는 무시하지 않고 400 으로 거절한다', () => {
    for (const field of ['username', 'id', 'email', 'password', 'createdAt', 'role']) {
      rejects({ [field]: 'x' }, field);
      // 허용 필드와 같이 보내도 거절
      rejects({ name: '김뉴비', [field]: 'x' }, field);
    }
  });

  it('빈 body 와 객체가 아닌 body 는 400', () => {
    rejects({});
    rejects(undefined);
    rejects(null);
    rejects([]);
    rejects('name');
  });

  it('문자열은 trim 한다', () => {
    assert.deepEqual(validateProfileUpdate({ name: '  김뉴비  ', job: '  developer ' }), {
      name: '김뉴비',
      job: 'developer',
    });
  });

  it('이름은 비어 있거나 공백뿐이거나 문자열이 아니면 거절, 50자 초과도 거절', () => {
    rejects({ name: '' });
    rejects({ name: '   ' });
    rejects({ name: null });
    rejects({ name: 123 });
    assert.equal(validateProfileUpdate({ name: 'a'.repeat(50) }).name?.length, 50);
    rejects({ name: 'a'.repeat(51) });
  });

  it('job/workStyle/bossStyle: null 또는 빈 문자열은 값을 비우고, 100자 초과와 문자열이 아닌 값은 거절', () => {
    assert.deepEqual(validateProfileUpdate({ job: null }), { job: null });
    assert.deepEqual(validateProfileUpdate({ workStyle: '   ' }), { workStyle: null });
    assert.deepEqual(validateProfileUpdate({ bossStyle: '' }), { bossStyle: null });
    assert.equal(validateProfileUpdate({ job: 'a'.repeat(100) }).job?.length, 100);
    rejects({ job: 'a'.repeat(101) });
    rejects({ workStyle: 5 });
    rejects({ bossStyle: ['x'] });
  });

  it('marketingAgreed 는 boolean 만 허용', () => {
    rejects({ marketingAgreed: 'true' });
    rejects({ marketingAgreed: 1 });
    rejects({ marketingAgreed: null });
  });
});
