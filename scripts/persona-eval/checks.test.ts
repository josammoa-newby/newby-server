import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkLength, checkPersonaBasis, checkSafety, checkSchema, tally } from './checks.js';

const VALID = {
  intent: '고치라는 뜻이에요',
  confidence: 'high',
  persona_basis: ['D 직설형'],
  recommended_action: '수정해서 다시 보고하세요',
  suggested_message: '수정해서 다시 드리겠습니다',
  avoid: '변명',
  follow_up_question: null,
  safety_flag: false,
};

describe('checkSchema', () => {
  it('올바른 응답은 통과한다', () => {
    assert.equal(checkSchema(VALID).status, 'pass');
    assert.equal(checkSchema({ ...VALID, follow_up_question: '어떤 부분이야?' }).status, 'pass');
  });

  it('필드가 없거나 타입이 틀리면 실패한다', () => {
    for (const field of ['intent', 'confidence', 'persona_basis', 'recommended_action', 'suggested_message', 'avoid', 'follow_up_question', 'safety_flag']) {
      const { [field]: _omit, ...rest } = VALID as Record<string, unknown>;
      assert.equal(checkSchema(rest).status, 'fail', field);
    }
    assert.equal(checkSchema({ ...VALID, confidence: 'certain' }).status, 'fail');
    assert.equal(checkSchema({ ...VALID, confidence: 0.9 }).status, 'fail');
    assert.equal(checkSchema({ ...VALID, persona_basis: 'D 직설형' }).status, 'fail');
    assert.equal(checkSchema({ ...VALID, persona_basis: [1] }).status, 'fail');
    assert.equal(checkSchema({ ...VALID, avoid: ['변명'] }).status, 'fail');
    assert.equal(checkSchema({ ...VALID, safety_flag: 'false' }).status, 'fail');
    assert.equal(checkSchema({ ...VALID, follow_up_question: 3 }).status, 'fail');
  });

  it('객체가 아니면 실패한다', () => {
    for (const value of [null, undefined, [], 'x', 3]) assert.equal(checkSchema(value).status, 'fail');
  });
});

describe('checkPersonaBasis', () => {
  it('1개 이상이면 통과, 비었거나 공백뿐이면 실패', () => {
    assert.equal(checkPersonaBasis(['a']).status, 'pass');
    assert.equal(checkPersonaBasis(['a', 'b']).detail, '2개');
    assert.equal(checkPersonaBasis([]).status, 'fail');
    assert.equal(checkPersonaBasis(['  ']).status, 'fail');
    assert.equal(checkPersonaBasis(undefined).status, 'fail');
    assert.equal(checkPersonaBasis('a').status, 'fail');
  });
});

describe('checkSafety', () => {
  it('안전 케이스는 true 여야, 일반 케이스는 false 여야 통과', () => {
    assert.equal(checkSafety(true, true).status, 'pass');
    assert.equal(checkSafety(false, false).status, 'pass');
    assert.equal(checkSafety(false, true).status, 'fail');
    assert.equal(checkSafety(true, false).status, 'fail');
  });
});

describe('checkLength', () => {
  const chars = (n: number) => '가'.repeat(n);

  it('messenger 는 120자, face 는 200자 이하만 통과 (경계값)', () => {
    assert.equal(checkLength(chars(120), 'messenger', false).status, 'pass');
    assert.equal(checkLength(chars(121), 'messenger', false).status, 'fail');
    assert.equal(checkLength(chars(200), 'face', false).status, 'pass');
    assert.equal(checkLength(chars(201), 'face', false).status, 'fail');
    // messenger 한도가 face 에는 적용되지 않는다
    assert.equal(checkLength(chars(150), 'face', false).status, 'pass');
  });

  it('결론형(R) messenger 는 80자 초과 시 경고만 한다', () => {
    assert.equal(checkLength(chars(80), 'messenger', true).status, 'pass');
    assert.equal(checkLength(chars(81), 'messenger', true).status, 'warn');
    assert.equal(checkLength(chars(120), 'messenger', true).status, 'warn');
    assert.equal(checkLength(chars(121), 'messenger', true).status, 'fail');
    // 결론형이어도 face 는 80자 권장이 없다
    assert.equal(checkLength(chars(150), 'face', true).status, 'pass');
    // 결론형이 아니면 경고 없음
    assert.equal(checkLength(chars(100), 'messenger', false).status, 'pass');
  });

  it('이모지 같은 서로게이트 문자도 한 글자로 센다', () => {
    assert.equal(checkLength('😀'.repeat(120), 'messenger', false).status, 'pass');
  });
});

describe('tally', () => {
  it('상태별로 센다', () => {
    assert.deepEqual(tally([{ status: 'pass' }, { status: 'pass' }, { status: 'fail' }, { status: 'warn' }, { status: 'manual' }]), {
      pass: 2,
      fail: 1,
      warn: 1,
      manual: 1,
    });
  });
});
