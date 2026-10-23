import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scorePersona } from '../persona/scoring.js';
import type { Answers } from '../persona/types.js';
import { toDetail, toSummary } from './supervisorMapper.js';
import type { SupervisorRow } from './supervisorMapper.js';

// 직설(D) + 디테일(C) + 결론(R) + 업무(T) 의 일관된 빠른 모드 응답
const CONSISTENT: Answers = {
  L1: 5, L2: 1, S1: 'a', L5: 5, L6: 1, S2: 'a', L9: 5, L10: 1, S3: 'a', L13: 1, L14: 5, S4: 'a',
};

function row(answers: Answers, overrides: Partial<SupervisorRow> = {}): SupervisorRow {
  const scores = scorePersona(answers);
  return {
    id: '11111111-1111-4111-8111-111111111111',
    nickname: '김팀장',
    position: '팀장',
    channel: 'messenger',
    mode: 'quick',
    answers,
    scores,
    score_adjust: {},
    code: scores.code,
    catchphrases: ['그래서 결론이 뭐야?'],
    anger_signals: null,
    happy_signals: '농담을 한다',
    dislikes: null,
    values_text: null,
    examples: [{ said: '검토해보자', meant: '고치라는 뜻' }],
    learned_notes: [],
    is_default: true,
    created_at: '2026-10-24T00:00:00.000Z',
    updated_at: '2026-10-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('toDetail', () => {
  it('응답 필드와 별명, 축별 값', () => {
    const detail = toDetail(row(CONSISTENT));
    assert.equal(detail.code, 'DCRT');
    assert.equal(detail.typeName, '레이더형 팀장');
    assert.equal(detail.scores.directness?.letter, 'D');
    assert.equal(detail.scores.directness?.strength, 'strong');
    assert.deepEqual(Object.keys(detail.scores.directness!).sort(), ['consistency', 'letter', 'score', 'strength']);
    assert.equal(detail.scores.speed, null);
    assert.equal(detail.scores.stability, null);
    assert.equal(detail.isDefault, true);
    assert.equal(detail.angerSignals, null);
    assert.equal(detail.happySignals, '농담을 한다');
    assert.deepEqual(detail.examples, [{ said: '검토해보자', meant: '고치라는 뜻' }]);
  });

  it('원본 answers 와 user_id 같은 내부 값은 응답에 없다', () => {
    const detail = toDetail({ ...row(CONSISTENT), user_id: 'someone-else' } as SupervisorRow);
    const keys = Object.keys(detail);
    for (const hidden of ['answers', 'user_id', 'userId', 'score_adjust']) assert.ok(!keys.includes(hidden), hidden);
    assert.ok(!JSON.stringify(detail).includes('someone-else'));
  });

  it('topRules 는 최대 3개', () => {
    assert.equal(toDetail(row(CONSISTENT)).topRules.length, 3);
  });

  it('needsCheck: consistency 가 0.5 미만인 축 이름 배열', () => {
    // L1=5, L2=5 는 역채점 충돌이라 directness 일관성이 낮다
    const detail = toDetail(row({ ...CONSISTENT, L1: 5, L2: 5, S1: 'c' }));
    assert.deepEqual(detail.needsCheck, ['directness']);
    assert.deepEqual(toDetail(row(CONSISTENT)).needsCheck, []);
  });

  it('score_adjust 가 있으면 보정 후 값과 코드를 쓴다', () => {
    const base = row(CONSISTENT);
    const detail = toDetail({ ...base, score_adjust: { directness: -200 } });
    assert.equal(detail.scores.directness?.score, -100);
    assert.equal(detail.scores.directness?.letter, 'I');
    assert.equal(detail.code, 'ICRT');
    assert.equal(detail.typeName, '눈치게임형');
    // 원본 행은 바뀌지 않는다
    assert.equal(base.scores.directness?.letter, 'D');
  });
});

describe('toDetail recentAdjustments', () => {
  it('기본값은 빈 배열이고, 넘긴 값은 그대로 응답에 담긴다', () => {
    assert.deepEqual(toDetail(row(CONSISTENT)).recentAdjustments, []);
    const adjustments = [
      { axis: 'directness' as const, dir: -1 as const, createdAt: '2026-10-24T09:00:00.000Z' },
      { axis: 'warmth' as const, dir: 1 as const, createdAt: '2026-10-23T09:00:00.000Z' },
    ];
    assert.deepEqual(toDetail(row(CONSISTENT), adjustments).recentAdjustments, adjustments);
  });
});

describe('toSummary', () => {
  it('요약 필드만 담는다', () => {
    const summary = toSummary(row(CONSISTENT));
    assert.deepEqual(Object.keys(summary).sort(), [
      'channel',
      'code',
      'createdAt',
      'id',
      'isDefault',
      'nickname',
      'position',
      'typeName',
    ]);
    assert.equal(summary.code, 'DCRT');
    assert.equal(summary.typeName, '레이더형 팀장');
  });

  it('보정이 있으면 보정된 코드를 쓴다', () => {
    assert.equal(toSummary({ ...row(CONSISTENT), score_adjust: { directness: -200 } }).code, 'ICRT');
  });
});
