import { getTypeName } from './scoring.js';
import { CORE_AXES } from './types.js';
import type { Axis, AxisResult, PersonaScores } from './types.js';

type CoreAxis = 'directness' | 'control' | 'reporting' | 'warmth';
type AuxAxis = 'speed' | 'stability';

// 강도 기준은 scoring.ts 의 strength 와 같다. (강함 |score|>=50, 약함 20<=|score|<50, 그 외 중립)
const STRONG = 50;
const MILD = 20;

type Level = 'strong' | 'mild';

function levelOf(result: AxisResult | null): Level | null {
  if (!result) return null;
  const abs = Math.abs(result.score);
  if (abs >= STRONG) return 'strong';
  if (abs >= MILD) return 'mild';
  return null;
}

// score >= 0 이면 첫 글자 방향(D/C/R/T), 아니면 둘째(I/A/P/W). scoring.ts 의 letter 규칙과 같다.
function isFirstDirection(result: AxisResult): boolean {
  return result.score >= 0;
}

// ---- 축별 규칙 문장 ----
// 방향(first/second) x 강도(strong/mild). 모두 "이 상사에게 어떻게 말해야 하는지"를 담는다.
const CORE_RULES: Record<CoreAxis, Record<'first' | 'second', Record<Level, string>>> = {
  directness: {
    first: {
      strong: '돌려 말하지 말고 핵심 문제와 요청을 첫 문장에 분명하게 말하세요.',
      mild: '요점을 먼저 말하고 배경 설명은 짧게 덧붙이세요.',
    },
    second: {
      strong: '요청이나 반론은 완곡하게 돌려 말하고, 상사의 애매한 표현은 구체적으로 되물어 확인하세요.',
      mild: '표현을 부드럽게 다듬어 전달하고, 상사의 말뜻이 불분명하면 한 번 더 확인하세요.',
    },
  },
  control: {
    first: {
      strong: '진행 상황을 먼저 자주 공유하고, 세부사항과 양식까지 꼼꼼히 확인한 뒤 보고하세요.',
      mild: '중간 점검 시점에 진행 상황을 한 번 공유하고, 보고 전에 세부사항을 다시 확인하세요.',
    },
    second: {
      strong: '맡은 일은 스스로 방향을 정해 진행하고, 막힐 때와 결과가 나왔을 때만 간결하게 알리세요.',
      mild: '진행 방식은 스스로 정하되, 중요한 갈림길에서만 짧게 확인받으세요.',
    },
  },
  reporting: {
    first: {
      strong: '결론부터 한두 줄로 말하고, 근거와 과정은 물어볼 때 설명하세요.',
      mild: '결론을 먼저 말한 뒤 핵심 근거만 간단히 덧붙이세요.',
    },
    second: {
      strong: '결론만 말하지 말고 어떤 과정을 거쳤는지와 검토한 대안까지 순서대로 설명하세요.',
      mild: '결론과 함께 판단 과정을 간단히 곁들여 설명하세요.',
    },
  },
  warmth: {
    first: {
      strong: '인사나 잡담은 짧게 하고 업무 내용, 사실, 해결책 중심으로 말하세요.',
      mild: '감정 표현은 줄이고 업무 이야기를 중심으로 하되 예의는 지키세요.',
    },
    second: {
      strong: '본론 전에 안부나 감사, 공감 표현으로 분위기를 먼저 풀고 상대의 기분을 살피며 말하세요.',
      mild: '본론 앞에 짧은 인사나 감사 표현을 곁들이고 상대의 기분을 헤아려 말하세요.',
    },
  },
};

// 보조축은 눈여겨볼 방향(speed=즉시형, stability=기복형)에만 약/강 문장을 하나씩 둔다.
const AUX_RULES: Record<AuxAxis, { first: boolean; sentences: Record<Level, string> }> = {
  speed: {
    first: true,
    sentences: {
      strong: '연락이나 요청에는 가능한 한 즉시 답하고, 바로 못 할 때는 언제까지 하겠다고 먼저 알리세요.',
      mild: '메신저 확인과 회신을 빠르게 하고, 급한 건인지 먼저 파악하세요.',
    },
  },
  stability: {
    first: false,
    sentences: {
      strong: '상사의 기분과 컨디션에 따라 반응이 달라질 수 있으니, 중요한 보고나 요청은 분위기가 좋은 때를 골라 하세요.',
      mild: '상사의 컨디션을 살펴 보고 시점을 조절하고, 반응이 달라져도 개인적으로 받아들이지 마세요.',
    },
  },
};

function coreRule(result: PersonaScores, axis: CoreAxis): string | null {
  const axisResult = result[axis];
  const level = levelOf(axisResult);
  if (!axisResult || !level) return null;
  return CORE_RULES[axis][isFirstDirection(axisResult) ? 'first' : 'second'][level];
}

function auxRules(result: PersonaScores): string[] {
  const rules: string[] = [];
  for (const axis of ['speed', 'stability'] as const) {
    const axisResult = result[axis];
    const level = levelOf(axisResult);
    if (!axisResult || !level) continue;
    if (isFirstDirection(axisResult) === AUX_RULES[axis].first) {
      rules.push(AUX_RULES[axis].sentences[level]);
    }
  }
  return rules;
}

// 조합 규칙과 무관하게 축별 문장만 모아 돌려준다. (핵심 4축 -> 보조 2축 순서)
export function getAxisRules(result: PersonaScores): string[] {
  const core = (CORE_AXES as readonly CoreAxis[])
    .map((axis) => coreRule(result, axis))
    .filter((sentence): sentence is string => sentence !== null);
  return [...core, ...auxRules(result)];
}

// ---- 조합 규칙 ----
export interface ComboCondition {
  axis: CoreAxis;
  // 'first' = D/C/R/T 쪽, 'second' = I/A/P/W 쪽
  direction: 'first' | 'second';
  // 이 강도 이상이어야 한다. 'mild' 는 |score|>=20, 'strong' 은 |score|>=50
  min: Level;
}

export interface ComboRule {
  id: string;
  when: readonly ComboCondition[];
  sentence: string;
}

const c = (axis: CoreAxis, direction: 'first' | 'second', min: Level = 'mild'): ComboCondition => ({
  axis,
  direction,
  min,
});

export const COMBO_RULES: readonly ComboRule[] = [
  {
    id: 'direct_control',
    when: [c('directness', 'first'), c('control', 'first')],
    sentence:
      '직설적이고 세세하게 챙기는 상사이므로, 지적을 감정으로 받아들이지 말고 진행 상황을 먼저 공유하며 지적받은 점은 바로 반영해 다시 보고하세요.',
  },
  {
    id: 'indirect_control',
    when: [c('directness', 'second'), c('control', 'first')],
    sentence:
      '말은 돌려 하지만 모든 걸 지켜보는 상사이므로, 완곡한 한마디도 수정 요청으로 보고 구체적으로 되물어 확인한 뒤 미리 진행 상황을 공유하세요.',
  },
  {
    id: 'direct_autonomy',
    when: [c('directness', 'first'), c('control', 'second')],
    sentence:
      '일은 맡기되 아니면 아니라고 바로 말하는 상사이므로, 스스로 판단해 진행하고 결과를 간결하게 보고하며 피드백이 나오면 담백하게 반영하세요.',
  },
  {
    id: 'indirect_autonomy',
    when: [c('directness', 'second'), c('control', 'second')],
    sentence:
      '말이 없으면 괜찮은 것이고 애매하면 확인이 필요한 상사이므로, 먼저 중간 확인을 요청해 기대 수준을 구체적으로 물어보세요.',
  },
  {
    id: 'direct_result_task',
    when: [c('directness', 'first'), c('reporting', 'first'), c('warmth', 'first')],
    sentence:
      '직설적이고 결론과 업무 중심인 상사이므로, 인사말과 배경 설명은 줄이고 결론, 근거, 요청 사항을 세 줄 안으로 정리해 말하세요.',
  },
  {
    id: 'process_warm',
    when: [c('reporting', 'second'), c('warmth', 'second')],
    sentence:
      '과정과 사람을 함께 보는 상사이므로, 결과만 전하지 말고 어떤 노력과 고민을 했는지 따뜻한 말투로 공유하세요.',
  },
  {
    id: 'control_process',
    when: [c('control', 'first'), c('reporting', 'second')],
    sentence:
      '세부사항과 과정까지 확인하는 상사이므로, 진행 단계와 판단 근거를 문서나 메시지로 남겨 두고 보고할 때 순서대로 설명하세요.',
  },
  {
    id: 'indirect_warm',
    when: [c('directness', 'second'), c('warmth', 'second')],
    sentence:
      '돌려 말하며 관계를 중시하는 상사이므로, 공감 표현으로 먼저 분위기를 맞추고 요청이나 반론은 부드럽게 전하며 숨은 뜻을 확인하세요.',
  },
];

const LEVEL_ORDER: Record<Level, number> = { mild: 1, strong: 2 };

function matches(rule: ComboRule, result: PersonaScores): boolean {
  return rule.when.every(({ axis, direction, min }) => {
    const axisResult = result[axis];
    const level = levelOf(axisResult);
    if (!axisResult || !level) return false;
    if (isFirstDirection(axisResult) !== (direction === 'first')) return false;
    return LEVEL_ORDER[level] >= LEVEL_ORDER[min];
  });
}

export function getComboRules(result: PersonaScores): ComboRule[] {
  return COMBO_RULES.filter((rule) => matches(rule, result));
}

// ---- 규칙 세트 ----
export interface RuleSet {
  rules: string[];
  summary: string;
}

const CORE_LABELS: Record<CoreAxis, [string, string]> = {
  directness: ['직설형', '돌려말형'],
  control: ['디테일·통제형', '자율·위임형'],
  reporting: ['결론 중심', '과정 중심'],
  warmth: ['업무 위주', '관계·정서형'],
};

const AUX_LABELS: Record<AuxAxis, [string, string]> = {
  speed: ['즉시형', '여유형'],
  stability: ['안정형', '기복형'],
};

function describeAxis(result: AxisResult | null, labels: [string, string]): string | null {
  if (!result) return null;
  const level = levelOf(result);
  const label = labels[isFirstDirection(result) ? 0 : 1];
  if (!level) return '중립';
  return `${label}(${level === 'strong' ? '강' : '약'})`;
}

function buildSummary(result: PersonaScores): string {
  const parts: string[] = [];

  const type = getTypeName(result.code);
  parts.push(type ? `유형: ${type.typeName} (${result.code}) - ${type.typeSummary}` : `유형 코드: ${result.code}`);

  const core = (CORE_AXES as readonly CoreAxis[])
    .map((axis) => {
      const description = describeAxis(result[axis], CORE_LABELS[axis]);
      return description ? `${CORE_LABELS[axis].join('/')}: ${description}` : null;
    })
    .filter((v): v is string => v !== null);
  if (core.length > 0) parts.push(`핵심 성향: ${core.join(', ')}`);

  const aux = (['speed', 'stability'] as const)
    .map((axis) => {
      const description = describeAxis(result[axis], AUX_LABELS[axis]);
      return description ? `${AUX_LABELS[axis].join('/')}: ${description}` : null;
    })
    .filter((v): v is string => v !== null);
  if (aux.length > 0) parts.push(`보조 성향: ${aux.join(', ')}`);

  return parts.join('\n');
}

// 조합 규칙이 걸리면 그 규칙이 다루는 축의 개별 문장은 빼고, 중복 문장은 합친다.
export function buildRuleSet(result: PersonaScores): RuleSet {
  const combos = getComboRules(result);
  const covered = new Set<Axis>(combos.flatMap((rule) => rule.when.map((cond) => cond.axis)));

  const rules: string[] = combos.map((rule) => rule.sentence);

  for (const axis of CORE_AXES as readonly CoreAxis[]) {
    if (covered.has(axis)) continue;
    const sentence = coreRule(result, axis);
    if (sentence) rules.push(sentence);
  }
  rules.push(...auxRules(result));

  return { rules: [...new Set(rules)], summary: buildSummary(result) };
}
