import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRuleLines, buildRuleSet, COMBO_RULES, getAxisRules, getComboRules } from './rules.js';
import type { Axis, AxisResult, PersonaScores } from './types.js';

const LETTERS: Record<Axis, [string, string]> = {
  directness: ['D', 'I'],
  control: ['C', 'A'],
  reporting: ['R', 'P'],
  warmth: ['T', 'W'],
  speed: ['즉시형', '여유형'],
  stability: ['안정형', '기복형'],
};

function axisResult(axis: Axis, score: number, consistency = 1): AxisResult {
  const abs = Math.abs(score);
  return {
    score,
    letter: LETTERS[axis][score >= 0 ? 0 : 1],
    strength: abs >= 50 ? 'strong' : abs >= 20 ? 'mild' : 'neutral',
    consistency,
    needsCheck: consistency < 0.5,
  };
}

// 지정하지 않은 축은 측정되지 않은 것(null)으로 둔다.
function scores(values: Partial<Record<Axis, number>>, consistency = 1): PersonaScores {
  const result = {} as PersonaScores;
  for (const axis of Object.keys(LETTERS) as Axis[]) {
    const value = values[axis];
    result[axis] = value === undefined ? null : axisResult(axis, value, consistency);
  }
  result.code = 'TEST';
  return result;
}

// 문장 일부로 줄을 찾는다.
const has = (lines: string[], fragment: string) => lines.some((line) => line.includes(fragment));

describe('축별 문장', () => {
  it('측정되지 않은 축(null)은 건너뛴다', () => {
    assert.deepEqual(getAxisRules(scores({})), []);
  });

  it('strength 경계: 19 는 중립 문장, 20 은 약함, 49 는 약함, 50 은 강함', () => {
    const at = (n: number) => getAxisRules(scores({ directness: n }));
    assert.ok(has(at(19), '직설/돌려말 축은 뚜렷하지 않다'));
    assert.ok(has(at(20), '대체로 직설적이지만'));
    assert.ok(has(at(49), '대체로 직설적이지만'));
    assert.ok(has(at(50), '말을 돌리지 않는다'));
    assert.ok(has(at(-19), '직설/돌려말 축은 뚜렷하지 않다'));
    assert.ok(has(at(-20), '가끔 돌려 말하니'));
    assert.ok(has(at(-50), '완곡하게 말한다'));
    for (const n of [19, 20, 49, 50, -19, -20, -49, -50]) assert.equal(at(n).length, 1, String(n));
  });

  it('모든 letter 에 강함/약함 문장이 있다 (12개 letter x 2)', () => {
    const cases: [Axis, number, string, string][] = [
      ['directness', 60, '말을 돌리지 않는다', '대체로 직설적이지만'],
      ['directness', -60, '완곡하게 말한다', '가끔 돌려 말하니'],
      ['control', 60, '진행 상황을 수시로', '중요한 일은 중간 점검'],
      ['control', -60, '간섭받는 것도', '기본적으로 맡기지만'],
      ['reporting', 60, '결론부터 말해야 한다', '결론을 앞에 두되'],
      ['reporting', -60, '과정과 고민한 흔적', '핵심 과정을 짧게'],
      ['warmth', 60, '업무 이야기만 선호한다', '가벼운 인사 정도는'],
      ['warmth', -60, '관계와 분위기를 중시한다', '기본적인 친근함'],
      ['speed', 60, '빠른 응답을 기대한다', '급한 건은 빨리'],
      ['speed', -60, '완성도를 본다', '마감만 지키면'],
      ['stability', 60, '같은 상황에서는 같은 반응을 기대해도 된다', '대체로 일관적이다'],
      ['stability', -60, '기분에 따라 반응이 달라진다', '컨디션을 한 번 살피고'],
    ];
    for (const [axis, strongScore, strong, mild] of cases) {
      const sign = Math.sign(strongScore);
      assert.ok(has(getAxisRules(scores({ [axis]: strongScore })), strong), `${axis} ${strongScore} strong`);
      assert.ok(has(getAxisRules(scores({ [axis]: sign * 30 })), mild), `${axis} ${sign * 30} mild`);
    }
  });

  it('안정형 문장은 말을 곧이곧대로 믿으라고 하지 않고 다른 축 규칙을 따르게 한다', () => {
    for (const score of [60, 30]) {
      assert.ok(!has(getAxisRules(scores({ stability: score })), '그대로 믿어도'));
    }
    const strong = getAxisRules(scores({ stability: 60 }))[0];
    assert.ok(strong.includes('다른 축 규칙을 따른다'));
    // 돌려말형과 함께여도 서로 모순되는 문장이 같이 나오지 않는다
    const both = getAxisRules(scores({ directness: -60, stability: 60 }));
    assert.ok(!both.some((line) => line.includes('그대로 믿어도')));
  });

  it('축 순서대로 줄이 만들어진다', () => {
    const lines = getAxisRules(scores({ stability: 60, directness: 60, warmth: 60, control: 60, speed: 60, reporting: 60 }));
    const order = ['말을 돌리지 않는다', '진행 상황을 수시로', '결론부터 말해야', '업무 이야기만', '빠른 응답', '반응 기준이'].map((f) =>
      lines.findIndex((line) => line.includes(f)),
    );
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5]);
  });

  it('neutral 문장은 축 이름이 바뀐다', () => {
    const lines = getAxisRules(scores({ control: 0, speed: 5, stability: -10 }));
    assert.ok(has(lines, '통제/자율 축은 뚜렷하지 않다'));
    assert.ok(has(lines, '즉시/여유 축은 뚜렷하지 않다'));
    assert.ok(has(lines, '안정/기복 축은 뚜렷하지 않다'));
    assert.ok(lines.every((l) => l.includes('두 가지 가능성을 모두 제시하라')));
  });

  it('consistency 경계: 0.49 는 LOW_CONSISTENCY 추가, 0.5 는 없음', () => {
    const low = getAxisRules(scores({ directness: 60 }, 0.49));
    assert.equal(low.length, 2);
    assert.ok(has(low, '직설/돌려말 축은 사용자 응답이 엇갈려 확신할 수 없다'));
    assert.ok(has(low, 'follow_up_question으로 확인하라'));
    assert.equal(getAxisRules(scores({ directness: 60 }, 0.5)).length, 1);
    // neutral 이어도 consistency 가 낮으면 둘 다 나온다
    assert.equal(getAxisRules(scores({ directness: 0 }, 0.2)).length, 2);
  });
});

// 조합 id -> 그 조합이 걸리는 점수
const COMBO_CASES: Record<string, { values: Partial<Record<Axis, number>>; sentence: string }> = {
  I_C: { values: { directness: -60, control: 60 }, sentence: '돌려 말하면서 세부까지 본다' },
  I_A: { values: { directness: -60, control: -60 }, sentence: '말이 적고 간섭도 적다' },
  D_C: { values: { directness: 60, control: 60 }, sentence: '자주 확인하고 바로 지적한다' },
  D_W: { values: { directness: 60, warmth: -60 }, sentence: '직설적이지만 정이 있다' },
  C_R: { values: { control: 60, reporting: 60 }, sentence: '짧고 잦은 보고를 원한다' },
  A_P: { values: { control: -60, reporting: -60 }, sentence: '맡기지만 과정은 궁금해한다' },
  I_unstable: { values: { directness: -60, stability: -60 }, sentence: '해석 난이도 최상' },
  T_immediate: { values: { warmth: 60, speed: 60 }, sentence: '용건만 빠르게' },
};

describe('조합 규칙', () => {
  it('8개이고 id 가 서로 다르며 테스트 케이스와 일치한다', () => {
    assert.equal(COMBO_RULES.length, 8);
    assert.deepEqual(COMBO_RULES.map((r) => r.id), Object.keys(COMBO_CASES));
  });

  for (const [id, { values, sentence }] of Object.entries(COMBO_CASES)) {
    it(`${id}: 걸리고, 개별 문장은 지워지지 않고 조합 문장이 추가된다`, () => {
      const persona = scores(values);
      assert.ok(getComboRules(persona).some((r) => r.id === id));
      const lines = buildRuleLines(persona);
      assert.ok(has(lines, sentence));
      for (const axisLine of getAxisRules(persona)) assert.ok(lines.includes(axisLine));
      // 조합 문장은 축별 문장 뒤에 온다
      const axisCount = getAxisRules(persona).length;
      assert.ok(lines.slice(axisCount).some((l) => l.includes(sentence)));
      assert.ok(lines.findIndex((l) => l.includes(sentence)) >= axisCount);
    });
  }

  it('약함(|score|>=20)도 조건을 만족한다', () => {
    assert.ok(getComboRules(scores({ directness: 20, control: 20 })).some((r) => r.id === 'D_C'));
  });

  it('한 축이 neutral 이면 걸리지 않는다 (중립 두 축 포함)', () => {
    assert.deepEqual(getComboRules(scores({ directness: 19, control: 60 })), []);
    assert.deepEqual(getComboRules(scores({ directness: 60, control: 10 })), []);
    assert.deepEqual(getComboRules(scores({ directness: 0, control: 0 })), []);
  });

  it('측정되지 않은 축(null)이 있으면 걸리지 않는다', () => {
    assert.deepEqual(getComboRules(scores({ directness: -60 })), []);
  });

  it('letter 가 맞지 않으면 걸리지 않는다', () => {
    // D + A 는 조합이 없다
    assert.deepEqual(getComboRules(scores({ directness: 60, control: -60 })), []);
  });

  it('여러 조합이 동시에 걸릴 수 있다', () => {
    const ids = getComboRules(scores({ directness: 60, control: 60, reporting: 60, warmth: -60 })).map((r) => r.id);
    assert.deepEqual(ids, ['D_C', 'D_W', 'C_R']);
  });
});

describe('buildRuleSet', () => {
  it('rules 는 buildRuleLines 와 같고 summary 에 코드와 성향이 들어간다', () => {
    const persona = { ...scores({ directness: 80, control: -30 }), code: 'DA??' };
    const set = buildRuleSet(persona);
    assert.deepEqual(set.rules, buildRuleLines(persona));
    assert.match(set.summary, /DA\?\?/);
    assert.match(set.summary, /쿨한 사수/);
    assert.match(set.summary, /직설형\(강\)/);
    assert.match(set.summary, /자율·위임형\(약\)/);
  });
});
