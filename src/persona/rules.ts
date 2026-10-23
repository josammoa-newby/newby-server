import { getTypeName } from './scoring.js';
import type { Axis, AxisResult, PersonaScores } from './types.js';

// 행동 규칙 줄을 만드는 순서. (scoring.ts 의 Axis 와 같은 이름)
const AXIS_ORDER: readonly Axis[] = ['directness', 'control', 'reporting', 'warmth', 'speed', 'stability'];

// 규칙 문장에 쓰는 축 이름
const AXIS_NAMES: Record<Axis, string> = {
  directness: '직설/돌려말',
  control: '통제/자율',
  reporting: '결론/과정',
  warmth: '업무/관계',
  speed: '즉시/여유',
  stability: '안정/기복',
};

// scoring.ts 의 letter 값 기준 (speed/stability 는 한글 표기)
const LETTER_SENTENCES: Record<string, { strong: string; mild: string }> = {
  D: {
    strong: '말을 돌리지 않는다. 표현 그대로가 진짜 의미일 가능성이 높다. 지적은 감정이 아니라 사실 전달이다.',
    mild: '대체로 직설적이지만 부드럽게 말할 때도 있다.',
  },
  I: {
    strong:
      "완곡하게 말한다. '검토해보자', '나중에 보자', '괜찮긴 한데'는 보류·거절·불만일 가능성이 높다. 말보다 행간과 침묵을 해석해야 한다.",
    mild: '가끔 돌려 말하니 애매한 표현은 한 번 확인하는 것이 안전하다.',
  },
  C: {
    strong: '진행 상황을 수시로 알고 싶어한다. 묻기 전에 먼저 중간보고하면 좋아한다. 오타·양식 같은 세부 실수에 민감하다.',
    mild: '중요한 일은 중간 점검을 원한다.',
  },
  A: {
    strong:
      '간섭받는 것도 자주 질문받는 것도 싫어한다. 질문은 모아서 한 번에, 보고는 완료 시점에 한다. 연락이 없다는 건 대체로 문제없다는 뜻이다.',
    mild: '기본적으로 맡기지만 마감 전 한 번은 확인을 원한다.',
  },
  R: {
    strong: "결론부터 말해야 한다. 보고는 '결론 → 근거 1~2개 → 필요한 결정' 순서로 3문장 이내.",
    mild: '결론을 앞에 두되 간단한 맥락은 덧붙여도 된다.',
  },
  P: {
    strong: '과정과 고민한 흔적을 중요하게 본다. 결과만 말하면 성의 없어 보일 수 있다. 대안을 2개 이상 준비하면 좋다.',
    mild: '결과와 함께 핵심 과정을 짧게 공유하면 좋다.',
  },
  T: {
    strong: '업무 이야기만 선호한다. 사적인 대화, 감정 표현, 과한 리액션은 최소화한다.',
    mild: '업무 중심이지만 가벼운 인사 정도는 괜찮다.',
  },
  W: {
    strong: '관계와 분위기를 중시한다. 인사, 감사, 공감 한마디가 효과적이다. 딱딱한 말투는 차갑게 느낄 수 있다.',
    mild: '기본적인 친근함을 보이면 소통이 수월하다.',
  },
  즉시형: {
    strong: '빠른 응답을 기대한다. 바로 처리 못 하면 "확인했습니다, OO시까지 드리겠습니다"처럼 먼저 답한다.',
    mild: '급한 건은 빨리 답하는 것이 좋다.',
  },
  여유형: {
    strong: '서두르는 것보다 완성도를 본다. 급하게 대충 가져가면 오히려 감점이다.',
    mild: '마감만 지키면 속도는 크게 상관없다.',
  },
  안정형: {
    strong: '반응 기준이 일정하다. 상사의 반응을 그대로 믿어도 된다.',
    mild: '대체로 일관적이다.',
  },
  기복형: {
    strong: '기분에 따라 반응이 달라진다. 불만 신호가 보이는 날은 큰 요청·보고를 미루고, 오전이나 기분 좋을 때를 노린다.',
    mild: '컨디션을 한 번 살피고 말을 꺼내는 게 좋다.',
  },
};

const LOW_CONSISTENCY_BELOW = 0.5;

const neutralSentence = (axis: Axis) =>
  `${AXIS_NAMES[axis]} 축은 뚜렷하지 않다. 이 성향에 따라 해석이 갈리는 상황이면 두 가지 가능성을 모두 제시하라.`;

const lowConsistencySentence = (axis: Axis) =>
  `${AXIS_NAMES[axis]} 축은 사용자 응답이 엇갈려 확신할 수 없다. 관련 상황이면 follow_up_question으로 확인하라.`;

function axisLines(axis: Axis, result: AxisResult): string[] {
  const lines: string[] = [];
  if (result.strength === 'neutral') {
    lines.push(neutralSentence(axis));
  } else {
    const sentences = LETTER_SENTENCES[result.letter];
    if (sentences) lines.push(result.strength === 'strong' ? sentences.strong : sentences.mild);
  }
  if (result.consistency < LOW_CONSISTENCY_BELOW) lines.push(lowConsistencySentence(axis));
  return lines;
}

// 축별 문장만 모아 돌려준다. (축 순서대로, 측정 안 된 축은 건너뜀)
export function getAxisRules(persona: PersonaScores): string[] {
  return AXIS_ORDER.flatMap((axis) => {
    const result = persona[axis];
    return result ? axisLines(axis, result) : [];
  });
}

// ---- 조합 규칙 ----
export interface ComboCondition {
  axis: Axis;
  letter: string;
}

export interface ComboRule {
  id: string;
  when: readonly [ComboCondition, ComboCondition];
  sentence: string;
}

const cond = (axis: Axis, letter: string): ComboCondition => ({ axis, letter });

export const COMBO_RULES: readonly ComboRule[] = [
  {
    id: 'I_C',
    when: [cond('directness', 'I'), cond('control', 'C')],
    sentence:
      '돌려 말하면서 세부까지 본다. 애매한 피드백은 대부분 수정 요청이다. 반드시 "어느 부분을 고치면 될까요?"로 구체화하라.',
  },
  {
    id: 'I_A',
    when: [cond('directness', 'I'), cond('control', 'A')],
    sentence: '말이 적고 간섭도 적다. 침묵은 대체로 OK지만, 애매한 한마디는 큰 신호일 수 있다.',
  },
  {
    id: 'D_C',
    when: [cond('directness', 'D'), cond('control', 'C')],
    sentence: '자주 확인하고 바로 지적한다. 지적이 잦아도 공격이 아니라 스타일이다. 짧고 잦은 중간보고가 최선이다.',
  },
  {
    id: 'D_W',
    when: [cond('directness', 'D'), cond('warmth', 'W')],
    sentence: '직설적이지만 정이 있다. 지적은 기대의 표현이다. 감사·반성 한마디를 덧붙이면 효과적이다.',
  },
  {
    id: 'C_R',
    when: [cond('control', 'C'), cond('reporting', 'R')],
    sentence: '짧고 잦은 보고를 원한다. 하루 1회 3줄 진행 요약이 이상적이다.',
  },
  {
    id: 'A_P',
    when: [cond('control', 'A'), cond('reporting', 'P')],
    sentence: '맡기지만 과정은 궁금해한다. 마감 전 한 번 "이런 방향으로 하고 있다" 공유하라.',
  },
  {
    id: 'I_unstable',
    when: [cond('directness', 'I'), cond('stability', '기복형')],
    sentence: '해석 난이도 최상. W2(불만 신호)를 최우선 근거로 쓰고, 확신이 없으면 직접 확인을 권하라.',
  },
  {
    id: 'T_immediate',
    when: [cond('warmth', 'T'), cond('speed', '즉시형')],
    sentence: '용건만 빠르게. 인사말 생략하고 첫 문장에 핵심을 넣어라.',
  },
];

// 두 축 모두 strength 가 neutral 이 아니고 letter 가 맞을 때 걸린다.
function matches(rule: ComboRule, persona: PersonaScores): boolean {
  return rule.when.every(({ axis, letter }) => {
    const result = persona[axis];
    return result !== null && result.strength !== 'neutral' && result.letter === letter;
  });
}

export function getComboRules(persona: PersonaScores): ComboRule[] {
  return COMBO_RULES.filter((rule) => matches(rule, persona));
}

// 행동 규칙 줄: 축별 문장 뒤에 조합 문장을 "추가"한다. (축별 문장은 지우지 않는다)
export function buildRuleLines(persona: PersonaScores): string[] {
  return [...getAxisRules(persona), ...getComboRules(persona).map((rule) => rule.sentence)];
}

// ---- 규칙 세트 ----
export interface RuleSet {
  rules: string[];
  summary: string;
}

const AXIS_LABELS: Record<Axis, [string, string]> = {
  directness: ['직설형', '돌려말형'],
  control: ['디테일·통제형', '자율·위임형'],
  reporting: ['결론 중심', '과정 중심'],
  warmth: ['업무 위주', '관계·정서형'],
  speed: ['즉시형', '여유형'],
  stability: ['안정형', '기복형'],
};

function describeAxis(axis: Axis, result: AxisResult): string {
  if (result.strength === 'neutral') return '중립';
  const label = AXIS_LABELS[axis][result.score >= 0 ? 0 : 1];
  return `${label}(${result.strength === 'strong' ? '강' : '약'})`;
}

function buildSummary(persona: PersonaScores): string {
  const parts: string[] = [];

  const type = getTypeName(persona.code);
  parts.push(type ? `유형: ${type.typeName} (${persona.code}) - ${type.typeSummary}` : `유형 코드: ${persona.code}`);

  const described = AXIS_ORDER.flatMap((axis) => {
    const result = persona[axis];
    return result ? [`${AXIS_LABELS[axis].join('/')}: ${describeAxis(axis, result)}`] : [];
  });
  if (described.length > 0) parts.push(`성향: ${described.join(', ')}`);

  return parts.join('\n');
}

export function buildRuleSet(persona: PersonaScores): RuleSet {
  return { rules: buildRuleLines(persona), summary: buildSummary(persona) };
}
