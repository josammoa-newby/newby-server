import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPublicQuestions } from './questions.js';
import { applyAdjust, getTypeName, scorePersona, validateAnswers } from './scoring.js';
import type { Answers } from './types.js';

const SPEED_STABILITY: Answers = {
  L17: 5, L18: 1, L19: 5, L20: 1,
  L21: 1, L22: 5, L23: 1, L24: 5,
};

const DIRECT: Answers = { L1: 5, L2: 1, L3: 5, L4: 1, S1: 'a' };
const INDIRECT: Answers = { L1: 1, L2: 5, L3: 1, L4: 5, S1: 'd' };
const CONTROL: Answers = { L5: 5, L6: 1, L7: 5, L8: 1, S2: 'a' };
const AUTONOMY: Answers = { L5: 1, L6: 5, L7: 1, L8: 5, S2: 'd' };
const REPORT_RESULT: Answers = { L9: 5, L10: 1, L11: 5, L12: 1, S3: 'a' };
const TASK_ORIENTED: Answers = { L13: 1, L14: 5, L15: 1, L16: 5, S4: 'a' };

const QUICK_KEYS = ['L1', 'L2', 'L5', 'L6', 'L9', 'L10', 'L13', 'L14', 'S1', 'S2', 'S3', 'S4'];
const pick = (answers: Answers, keys: string[]): Answers =>
  Object.fromEntries(keys.filter((k) => k in answers).map((k) => [k, answers[k]]));

const FULL_SETS: [string, Answers, string, string][] = [
  ['DCRT', { ...DIRECT, ...CONTROL, ...REPORT_RESULT, ...TASK_ORIENTED, ...SPEED_STABILITY }, 'DCRT', '레이더형 팀장'],
  ['DART', { ...DIRECT, ...AUTONOMY, ...REPORT_RESULT, ...TASK_ORIENTED, ...SPEED_STABILITY }, 'DART', '쿨한 사수'],
  ['ICRT', { ...INDIRECT, ...CONTROL, ...REPORT_RESULT, ...TASK_ORIENTED, ...SPEED_STABILITY }, 'ICRT', '눈치게임형'],
  ['IART', { ...INDIRECT, ...AUTONOMY, ...REPORT_RESULT, ...TASK_ORIENTED, ...SPEED_STABILITY }, 'IART', '무소식이 희소식형'],
];

describe('scorePersona (full)', () => {
  for (const [name, answers, code, typeName] of FULL_SETS) {
    it(`${name}: 코드와 별명`, () => {
      assert.equal(validateAnswers(answers, 'full').ok, true);
      const scores = scorePersona(answers);
      assert.equal(scores.code, code);
      assert.equal(getTypeName(scores.code)?.typeName, typeName);
      assert.equal(scores.speed?.letter, '즉시형');
      assert.equal(scores.stability?.letter, '안정형');
      for (const axis of ['directness', 'control', 'reporting', 'warmth', 'speed', 'stability'] as const) {
        assert.equal(scores[axis]?.strength, 'strong', `${name} ${axis}`);
        assert.ok((scores[axis]?.consistency ?? 0) >= 0.9, `${name} ${axis} consistency`);
      }
    });
  }
});

describe('scorePersona (quick)', () => {
  it('12문항만으로 같은 코드가 나오고 speed/stability 는 null', () => {
    for (const [name, answers, code] of FULL_SETS) {
      const quick = pick(answers, QUICK_KEYS);
      assert.equal(Object.keys(quick).length, 12);
      assert.equal(validateAnswers(quick, 'quick').ok, true, name);
      const scores = scorePersona(quick);
      assert.equal(scores.code, code);
      assert.equal(scores.speed, null);
      assert.equal(scores.stability, null);
    }
  });

  it('측정되지 않은 핵심 축은 코드에 ? 로 표시되고 별명은 null', () => {
    const scores = scorePersona({ L1: 5 });
    assert.equal(scores.code, 'D???');
    assert.equal(getTypeName(scores.code), null);
  });
});

describe('일관성과 채점 규칙', () => {
  it('모순 응답(L1=5, L2=5)은 consistency 가 낮고 needsCheck', () => {
    const result = scorePersona({ L1: 5, L2: 5 }).directness!;
    assert.ok(result.consistency < 0.5);
    assert.equal(result.needsCheck, true);
  });

  it('역채점: L13=5 는 warmth 를 W 쪽(음수)으로 보낸다', () => {
    const result = scorePersona({ L13: 5 }).warmth!;
    assert.equal(result.score, -100);
    assert.equal(result.letter, 'W');
  });

  it('상황형 가중치 1.5: 리커트 +100, 상황형 -60 → (100 - 90) / 2.5 = 4', () => {
    const result = scorePersona({ L1: 5, S1: 'c' }).directness!;
    assert.equal(result.score, 4);
    assert.equal(result.letter, 'D');
    assert.equal(result.strength, 'neutral');
  });

  it('score 가 0 이면 첫 글자', () => {
    assert.equal(scorePersona({ L1: 3 }).directness?.letter, 'D');
  });
});

describe('validateAnswers', () => {
  const valid = pick(FULL_SETS[0][1], QUICK_KEYS);

  it('필수 문항 누락', () => {
    const { L1: _omit, ...rest } = valid;
    assert.equal(validateAnswers(rest, 'quick').ok, false);
    assert.equal(validateAnswers(valid, 'full').ok, false);
  });

  it('범위 밖 값 (6, 0, 2.5)', () => {
    for (const bad of [6, 0, 2.5]) {
      assert.equal(validateAnswers({ ...valid, L1: bad }, 'quick').ok, false, String(bad));
    }
  });

  it('알 수 없는 문항', () => {
    assert.equal(validateAnswers({ ...valid, L99: 3 }, 'quick').ok, false);
  });

  it('상황형에 잘못된 키', () => {
    assert.equal(validateAnswers({ ...valid, S1: 'e' }, 'quick').ok, false);
  });

  it('타입이 다른 값과 객체가 아닌 입력', () => {
    assert.equal(validateAnswers({ ...valid, L1: '5' }, 'quick').ok, false);
    assert.equal(validateAnswers(null, 'quick').ok, false);
    assert.equal(validateAnswers([], 'quick').ok, false);
  });
});

describe('applyAdjust', () => {
  const base = scorePersona(FULL_SETS[0][1]);

  it('원본은 변경하지 않는다', () => {
    const snapshot = JSON.stringify(base);
    applyAdjust(base, { directness: -50 });
    assert.equal(JSON.stringify(base), snapshot);
  });

  it('-100~100 으로 제한한다', () => {
    const adjusted = applyAdjust(base, { directness: 500, control: -500 });
    assert.equal(adjusted.directness?.score, 100);
    assert.equal(adjusted.control?.score, -100);
  });

  it('보정 후 letter/strength/code 가 바뀌고 consistency 는 유지된다', () => {
    const adjusted = applyAdjust(base, { directness: -150 });
    assert.equal(base.directness?.letter, 'D');
    assert.equal(adjusted.directness?.letter, 'I');
    assert.equal(adjusted.code, 'ICRT');
    assert.equal(adjusted.directness?.consistency, base.directness?.consistency);
    assert.equal(adjusted.directness?.needsCheck, base.directness?.needsCheck);
  });

  it('측정되지 않은 축(null)은 그대로 null', () => {
    const quick = scorePersona(pick(FULL_SETS[0][1], QUICK_KEYS));
    assert.equal(applyAdjust(quick, { speed: 30 }).speed, null);
  });
});

describe('getPublicQuestions', () => {
  it('quick 12개, full 28개', () => {
    assert.equal(getPublicQuestions('quick').length, 12);
    assert.equal(getPublicQuestions('full').length, 28);
  });

  it('채점 정보(axis/reverse/score)를 노출하지 않는다', () => {
    for (const q of getPublicQuestions('full')) {
      const json = JSON.stringify(q);
      assert.ok(!/"(axis|reverse|score|quick)"/.test(json), json);
      assert.deepEqual(Object.keys(q).filter((k) => !['id', 'text', 'options'].includes(k)), []);
      if ('options' in q) {
        for (const o of q.options) assert.deepEqual(Object.keys(o).sort(), ['key', 'text']);
      }
    }
  });
});
