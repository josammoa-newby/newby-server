import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkCodeAbbrev,
  checkLegal,
  checkLength,
  checkPersonaBasis,
  checkSafety,
  checkSchema,
  checkTone,
  tally,
} from './checks.js';

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

describe('checkTone (g)', () => {
  const ok = { intent: '정말로 같이 보자는 뜻이야.', recommended_action: '먼저 물어봐.', avoid: '변명은 하지 마' };
  const tone = (overrides: Partial<typeof ok>) => checkTone({ ...ok, ...overrides });

  it('반말 구어체는 통과한다', () => {
    assert.equal(checkTone(ok).status, 'pass');
    assert.equal(tone({ intent: '괴롭힘에 해당할 수 있어. 먼저 기록부터 해봐.' }).status, 'pass');
  });

  it("'~임.', '~함.', '~입니다', '~합니다' 로 끝나는 문장은 경고한다", () => {
    assert.equal(tone({ intent: '큰 문제임.' }).status, 'warn');
    assert.equal(tone({ intent: '직장 내 괴롭힘에 해당함.' }).status, 'warn');
    // '~습니다'(좋습니다)는 기준 목록(입니다/합니다)에 없다
    assert.equal(tone({ recommended_action: '기록을 남기는 것이 좋습니다' }).status, 'pass');
    assert.equal(tone({ recommended_action: '기록을 남깁니다.' }).status, 'pass');
    assert.equal(tone({ recommended_action: '고충처리 창구에 상담하는 것이 필요합니다.' }).status, 'warn');
    assert.equal(tone({ avoid: '상사에게 따지는 것은 부적절합니다' }).status, 'warn');
    assert.equal(tone({ intent: '업무 요청입니다.' }).status, 'warn');
  });

  it('여러 문장 중 하나만 문어체여도 경고하고 어느 필드인지 알려준다', () => {
    const result = tone({ intent: '당황했겠다. 업무 지시임. 걱정 마.' });
    assert.equal(result.status, 'warn');
    assert.match(result.detail, /intent/);
  });

  it('AiAnswer 전체(배열 필드 포함)를 넘겨도 세 필드만 검사한다', () => {
    const answer = { ...ok, persona_basis: ['직설형'], safety_flag: false, confidence: 'high', suggested_message: '확인했습니다.' };
    assert.equal(checkTone(answer).status, 'pass');
  });

  it('문장 중간의 표현은 문제 삼지 않는다', () => {
    assert.equal(tone({ intent: '함께 보자는 뜻이야. 임시로 먼저 답해봐.' }).status, 'pass');
  });
});

describe('checkLegal (h)', () => {
  const legal = (intent: string, action = '기록해둬.') => checkLegal({ intent, recommended_action: action });

  it("'범죄', '위법', '불법' 이 intent/recommended_action 에 있으면 실패", () => {
    assert.equal(legal('괴롭힘에 해당할 수 있어.').status, 'pass');
    assert.equal(legal('명백한 범죄 행위야.').status, 'fail');
    assert.equal(legal('위법한 지시야.').status, 'fail');
    assert.equal(legal('괜찮아.', '불법이니까 신고해.').status, 'fail');
    assert.match(legal('범죄야.', '위법이야.').detail, /범죄.*위법|위법.*범죄/);
  });

  it('다른 필드(avoid, suggested_message)는 검사하지 않는다', () => {
    assert.equal(checkLegal({ intent: '괜찮아.', recommended_action: '기록해둬.', ...({ avoid: '불법' } as object) }).status, 'pass');
  });
});

describe('checkCodeAbbrev (i)', () => {
  it('DCRT, DART 같은 4글자 유형 코드는 경고한다', () => {
    assert.equal(checkCodeAbbrev(['직설형: 말을 돌리지 않는다']).status, 'pass');
    assert.equal(checkCodeAbbrev(['DCRT 레이더형 팀장: 말을 돌리지 않는다']).status, 'warn');
    assert.equal(checkCodeAbbrev(['김팀장', 'DART 행동 규칙']).status, 'warn');
    assert.equal(checkCodeAbbrev(['ICRT 눈치게임형']).status, 'warn');
    assert.equal(checkCodeAbbrev(['IART']).status, 'warn');
    assert.equal(checkCodeAbbrev(['DCRT김팀장']).status, 'warn');
  });

  it('한 글자 약어나 일반 단어는 문제 삼지 않는다', () => {
    assert.equal(checkCodeAbbrev(['D 직설형', 'I+C 조합']).status, 'pass');
    assert.equal(checkCodeAbbrev(['DCRTX', 'XDART']).status, 'pass');
    assert.equal(checkCodeAbbrev([]).status, 'pass');
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
