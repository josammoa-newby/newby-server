import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getAxisRules } from './rules.js';
import { getTopRules } from './topRules.js';
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

function scores(values: Partial<Record<Axis, number>>, consistency = 1): PersonaScores {
  const result = {} as PersonaScores;
  for (const axis of Object.keys(LETTERS) as Axis[]) {
    const value = values[axis];
    result[axis] = value === undefined ? null : axisResult(axis, value, consistency);
  }
  result.code = 'TEST';
  return result;
}

const single = (axis: Axis, score: number) => getAxisRules(scores({ [axis]: score }))[0];

describe('getTopRules', () => {
  it('최대 3개이고 strong 축 문장을 우선한다', () => {
    const rules = getTopRules(scores({ directness: 30, control: 60, reporting: 70, warmth: 20, speed: 80 }));
    assert.equal(rules.length, 3);
    assert.deepEqual(rules, [single('control', 60), single('reporting', 70), single('speed', 80)]);
  });

  it('strong 이 3개보다 적으면 mild 로 채운다 (축 순서)', () => {
    const rules = getTopRules(scores({ directness: 30, control: 60, reporting: 25, warmth: 20 }));
    assert.deepEqual(rules, [single('control', 60), single('directness', 30), single('reporting', 25)]);
  });

  it('중립과 측정되지 않은 축은 제외하고, 없으면 빈 배열', () => {
    assert.deepEqual(getTopRules(scores({ directness: 10, control: 0 })), []);
    assert.deepEqual(getTopRules(scores({})), []);
    assert.deepEqual(getTopRules(scores({ directness: 60, control: 5 })), [single('directness', 60)]);
  });

  it('조합 문장과 낮은 일관성 문장은 섞이지 않는다', () => {
    // directness I + control C 는 조합이 걸리지만 topRules 는 축별 문장만 낸다
    const rules = getTopRules(scores({ directness: -60, control: 60 }, 0.2));
    assert.deepEqual(rules, [single('directness', -60), single('control', 60)]);
    assert.ok(rules.every((r) => !r.includes('확신할 수 없다')));
    assert.ok(rules.every((r) => !r.includes('돌려 말하면서 세부까지 본다')));
  });

  it('limit 을 바꿀 수 있다', () => {
    assert.equal(getTopRules(scores({ directness: 60, control: 60, reporting: 60, warmth: 60 }), 2).length, 2);
  });
});
