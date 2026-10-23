import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRuleSet, COMBO_RULES, getAxisRules, getComboRules } from './rules.js';
import type { Axis, AxisResult, PersonaScores } from './types.js';

const LETTERS: Record<Axis, [string, string]> = {
  directness: ['D', 'I'],
  control: ['C', 'A'],
  reporting: ['R', 'P'],
  warmth: ['T', 'W'],
  speed: ['즉시형', '여유형'],
  stability: ['안정형', '기복형'],
};

function axisResult(axis: Axis, score: number): AxisResult {
  const abs = Math.abs(score);
  return {
    score,
    letter: LETTERS[axis][score >= 0 ? 0 : 1],
    strength: abs >= 50 ? 'strong' : abs >= 20 ? 'mild' : 'neutral',
    consistency: 1,
    needsCheck: false,
  };
}

// 지정하지 않은 축은 측정되지 않은 것(null)으로 둔다.
function scores(values: Partial<Record<Axis, number>>): PersonaScores {
  const result = {} as PersonaScores;
  for (const axis of Object.keys(LETTERS) as Axis[]) {
    const value = values[axis];
    result[axis] = value === undefined ? null : axisResult(axis, value);
  }
  result.code = 'TEST';
  return result;
}

const NEUTRAL = scores({ directness: 0, control: 0, reporting: 0, warmth: 0, speed: 0, stability: 0 });

describe('getAxisRules', () => {
  it('중립 점수는 규칙이 0개', () => {
    assert.deepEqual(getAxisRules(NEUTRAL), []);
    assert.deepEqual(buildRuleSet(NEUTRAL).rules, []);
    assert.deepEqual(getAxisRules(scores({})), []);
  });

  it('경계값 19/20/49/50 (양방향)', () => {
    for (const axis of ['directness', 'control', 'reporting', 'warmth'] as const) {
      for (const sign of [1, -1]) {
        const at = (n: number) => getAxisRules(scores({ [axis]: sign * n }));
        assert.equal(at(19).length, 0, `${axis} ${sign * 19}`);
        assert.equal(at(20).length, 1, `${axis} ${sign * 20}`);
        assert.equal(at(49).length, 1, `${axis} ${sign * 49}`);
        assert.equal(at(50).length, 1, `${axis} ${sign * 50}`);
        // 약함과 강함은 다른 문장
        assert.notEqual(at(49)[0], at(50)[0], `${axis} ${sign} 약/강 문장이 같음`);
        // 방향이 다르면 다른 문장
        assert.notEqual(
          getAxisRules(scores({ [axis]: 60 }))[0],
          getAxisRules(scores({ [axis]: -60 }))[0],
          `${axis} 방향별 문장이 같음`,
        );
      }
    }
  });

  it('보조축은 눈여겨볼 방향(즉시형, 기복형)에서만 약/강 문장 1개씩', () => {
    assert.equal(getAxisRules(scores({ speed: 19 })).length, 0);
    assert.equal(getAxisRules(scores({ speed: 30 })).length, 1);
    assert.equal(getAxisRules(scores({ speed: 80 })).length, 1);
    assert.notEqual(getAxisRules(scores({ speed: 30 }))[0], getAxisRules(scores({ speed: 80 }))[0]);
    assert.equal(getAxisRules(scores({ speed: -80 })).length, 0);

    assert.equal(getAxisRules(scores({ stability: -30 })).length, 1);
    assert.equal(getAxisRules(scores({ stability: -80 })).length, 1);
    assert.notEqual(getAxisRules(scores({ stability: -30 }))[0], getAxisRules(scores({ stability: -80 }))[0]);
    assert.equal(getAxisRules(scores({ stability: 80 })).length, 0);
  });
});

// 조합 규칙 id -> 그 규칙만 걸리는 점수
const COMBO_CASES: Record<string, Partial<Record<Axis, number>>> = {
  direct_control: { directness: 60, control: 60 },
  indirect_control: { directness: -60, control: 60 },
  direct_autonomy: { directness: 60, control: -60 },
  indirect_autonomy: { directness: -60, control: -60 },
  direct_result_task: { directness: 60, reporting: 60, warmth: 60 },
  process_warm: { reporting: -60, warmth: -60 },
  control_process: { control: 60, reporting: -60 },
  indirect_warm: { directness: -60, warmth: -60 },
};

describe('getComboRules', () => {
  it('조합 규칙은 8개이고 id 가 서로 다르다', () => {
    assert.equal(COMBO_RULES.length, 8);
    assert.equal(new Set(COMBO_RULES.map((r) => r.id)).size, 8);
    assert.deepEqual(Object.keys(COMBO_CASES).sort(), COMBO_RULES.map((r) => r.id).sort());
  });

  for (const [id, values] of Object.entries(COMBO_CASES)) {
    it(`${id}: 걸린다`, () => {
      const ids = getComboRules(scores(values)).map((r) => r.id);
      assert.ok(ids.includes(id), `${id} 가 걸리지 않음: ${ids.join(',')}`);
    });
  }

  it('조합 조건에 맞지 않으면 걸리지 않는다', () => {
    assert.deepEqual(getComboRules(NEUTRAL), []);
    // directness 가 중립이면 direct_control 이 걸리지 않는다
    assert.ok(!getComboRules(scores({ directness: 19, control: 60 })).some((r) => r.id === 'direct_control'));
    // 약함(20) 이상이면 걸린다
    assert.ok(getComboRules(scores({ directness: 20, control: 20 })).some((r) => r.id === 'direct_control'));
  });
});

describe('buildRuleSet', () => {
  it('조합 규칙이 걸리면 그 축의 개별 문장은 빠지고 조합 문장이 쓰인다', () => {
    const input = scores({ directness: 60, control: 60 });
    const ruleSet = buildRuleSet(input);
    const combo = COMBO_RULES.find((r) => r.id === 'direct_control')!;
    assert.deepEqual(ruleSet.rules, [combo.sentence]);
    for (const axisRule of getAxisRules(input)) assert.ok(!ruleSet.rules.includes(axisRule));
  });

  it('조합에 쓰이지 않은 축과 보조축 문장은 남고 중복은 합쳐진다', () => {
    const input = scores({ directness: 60, control: 60, reporting: 60, speed: 60 });
    const ruleSet = buildRuleSet(input);
    assert.equal(ruleSet.rules.length, new Set(ruleSet.rules).size);
    const [reportingRule] = getAxisRules(scores({ reporting: 60 }));
    const [speedRule] = getAxisRules(scores({ speed: 60 }));
    assert.ok(ruleSet.rules.includes(reportingRule));
    assert.ok(ruleSet.rules.includes(speedRule));
  });

  it('summary 에 코드와 성향 표기가 들어간다', () => {
    const summary = buildRuleSet({ ...scores({ directness: 80, control: -30 }), code: 'DA??' }).summary;
    assert.match(summary, /DA\?\?/);
    assert.match(summary, /쿨한 사수/);
    assert.match(summary, /직설형\(강\)/);
    assert.match(summary, /자율·위임형\(약\)/);
  });
});
