import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../lib/AppError.js';
import { MAX_REACTION_LENGTH, validateFeedback } from './feedbackValidation.js';

function rejects(body: unknown) {
  assert.throws(
    () => validateFeedback(body),
    (err: unknown) => err instanceof AppError && err.status === 400 && err.code === 'VALIDATION_ERROR',
  );
}

describe('validateFeedback', () => {
  it('helpful 은 boolean 이어야 한다', () => {
    for (const body of [{}, { helpful: 'true' }, { helpful: 1 }, { helpful: null }]) rejects(body);
    assert.equal(validateFeedback({ helpful: true }).helpful, true);
    assert.equal(validateFeedback({ helpful: false }).helpful, false);
  });

  it('객체가 아닌 body 는 400', () => {
    for (const body of [undefined, null, [], 'x', 3]) rejects(body);
  });

  it('helpful=true 이면 actualReaction 은 무시한다 (잘못된 값이어도)', () => {
    assert.deepEqual(validateFeedback({ helpful: true, actualReaction: '무시' }), { helpful: true, actualReaction: null });
    assert.deepEqual(validateFeedback({ helpful: true, actualReaction: 5 }), { helpful: true, actualReaction: null });
    assert.deepEqual(validateFeedback({ helpful: true, actualReaction: 'a'.repeat(900) }), { helpful: true, actualReaction: null });
  });

  it('helpful=false: actualReaction 은 trim 하고 최대 500자', () => {
    assert.equal(validateFeedback({ helpful: false, actualReaction: '  그냥 말 그대로였어  ' }).actualReaction, '그냥 말 그대로였어');
    assert.equal(MAX_REACTION_LENGTH, 500);
    assert.equal(validateFeedback({ helpful: false, actualReaction: 'a'.repeat(500) }).actualReaction?.length, 500);
    assert.equal(validateFeedback({ helpful: false, actualReaction: `  ${'a'.repeat(500)}  ` }).actualReaction?.length, 500);
    rejects({ helpful: false, actualReaction: 'a'.repeat(501) });
  });

  it('helpful=false: actualReaction 이 없거나 비어 있으면 null, 문자열이 아니면 400', () => {
    assert.equal(validateFeedback({ helpful: false }).actualReaction, null);
    assert.equal(validateFeedback({ helpful: false, actualReaction: null }).actualReaction, null);
    assert.equal(validateFeedback({ helpful: false, actualReaction: '   ' }).actualReaction, null);
    rejects({ helpful: false, actualReaction: 5 });
    rejects({ helpful: false, actualReaction: ['a'] });
  });
});
