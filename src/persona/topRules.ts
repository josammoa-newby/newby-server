import { getAxisRules } from './rules.js';
import type { Axis, AxisResult, PersonaScores } from './types.js';

const AXIS_ORDER: readonly Axis[] = ['directness', 'control', 'reporting', 'warmth', 'speed', 'stability'];

const NO_AXES: Record<Axis, null> = {
  directness: null,
  control: null,
  reporting: null,
  warmth: null,
  speed: null,
  stability: null,
};

// 한 축의 규칙 문장만 얻는다. 다른 축은 측정되지 않은 것으로 두고, 낮은 일관성 문장은 섞이지 않게 consistency 를 고정한다.
function axisSentence(axis: Axis, result: AxisResult): string | null {
  const alone: PersonaScores = { ...NO_AXES, [axis]: { ...result, consistency: 1 }, code: '' };
  return getAxisRules(alone)[0] ?? null;
}

// strong 인 축의 규칙 문장을 우선하고, 부족하면 mild 로 채운다. 조합 문장과 중립 축은 제외한다.
export function getTopRules(persona: PersonaScores, limit = 3): string[] {
  const picked: string[] = [];
  for (const strength of ['strong', 'mild'] as const) {
    for (const axis of AXIS_ORDER) {
      const result = persona[axis];
      if (!result || result.strength !== strength) continue;
      const sentence = axisSentence(axis, result);
      if (sentence) picked.push(sentence);
    }
  }
  return picked.slice(0, limit);
}
