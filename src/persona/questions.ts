import type { Axis, Mode } from './types.js';

export interface LikertQuestion {
  id: string;
  axis: Axis;
  reverse: boolean;
  quick: boolean;
  text: string;
}

export interface SituationOption {
  key: string;
  text: string;
  score: number;
}

export interface SituationQuestion {
  id: string;
  axis: Axis;
  quick: true;
  text: string;
  options: SituationOption[];
}

export type Question = LikertQuestion | SituationQuestion;

export type PublicQuestion =
  | { id: string; text: string }
  | { id: string; text: string; options: { key: string; text: string }[] };

// 리커트 척도: 1 전혀 아니다 / 2 아닌 편 / 3 보통 / 4 그런 편 / 5 매우 그렇다
function likert(
  n: number,
  axis: Axis,
  text: string,
  { quick = false, reverse = false }: { quick?: boolean; reverse?: boolean } = {},
): LikertQuestion {
  return { id: `L${n}`, axis, reverse, quick, text };
}

function situation(
  n: number,
  axis: Axis,
  text: string,
  options: [string, number][],
): SituationQuestion {
  return {
    id: `S${n}`,
    axis,
    quick: true,
    text,
    options: options.map(([optionText, score], i) => ({
      key: String.fromCharCode(97 + i),
      text: optionText,
      score,
    })),
  };
}

export const QUESTIONS: readonly Question[] = [
  // ① directness (D=직설형 / I=돌려말형)
  likert(1, 'directness', '마음에 안 드는 게 있으면 그 자리에서 바로 말한다', { quick: true }),
  likert(2, 'directness', '"한번 생각해보자", "나중에 다시 보자"처럼 애매하게 말하고 넘어갈 때가 많다', {
    quick: true,
    reverse: true,
  }),
  likert(3, 'directness', '지적할 때 돌려 말하지 않고 무엇이 문제인지 정확히 짚는다'),
  likert(4, 'directness', '진짜 하고 싶은 말을 농담이나 혼잣말처럼 할 때가 있다', { reverse: true }),
  situation(1, 'directness', '네가 낸 기획안이 별로일 때 상사 반응은?', [
    ['"이건 방향이 틀렸어"라고 바로 말한다', 80],
    ['좋은 점을 먼저 말하고 고칠 점을 말한다', 30],
    ['"음… 좀 더 고민해볼까?" 하고 넘어간다', -60],
    ['아무 말 없다가 나중에 다른 사람에게 일을 넘긴다', -90],
  ]),

  // ② control (C=디테일·통제형 / A=자율·위임형)
  likert(5, 'control', '일을 맡긴 뒤에도 중간중간 진행 상황을 물어본다', { quick: true }),
  likert(6, 'control', '방법은 알아서 하라 하고 결과만 본다', { quick: true, reverse: true }),
  likert(7, 'control', '오타, 양식, 줄 간격 같은 세부사항까지 체크한다'),
  likert(8, 'control', '내가 먼저 묻지 않으면 별말 없이 기다려준다', { reverse: true }),
  situation(2, 'control', '3일짜리 업무를 맡겼을 때 상사는?', [
    ['매일 진행 상황을 묻는다', 90],
    ['중간에 한 번 확인한다', 30],
    ['마감 날 결과만 확인한다', -60],
    ['마감이 지나도 먼저 묻지 않는다', -90],
  ]),

  // ③ reporting (R=결론 중심 / P=과정 중심)
  likert(9, 'reporting', '보고 중에 "그래서 결론이 뭐야?"라고 자주 끊는다', { quick: true }),
  likert(10, 'reporting', '결과보다 어떤 과정을 거쳤는지 궁금해한다', { quick: true, reverse: true }),
  likert(11, 'reporting', '긴 메시지나 문서를 싫어하고 요약을 원한다'),
  likert(12, 'reporting', '보고할 때 대안이나 고민한 흔적을 같이 가져오길 원한다', { reverse: true }),
  situation(3, 'reporting', '문제가 생겨서 보고해야 할 때 상사가 가장 원하는 건?', [
    ['무슨 일이고 어떻게 할지 한 줄로', 90],
    ['결론 먼저, 원인은 물어보면 설명', 40],
    ['어떻게 된 건지 처음부터 차근차근', -50],
    ['원인 분석과 대안 여러 개', -80],
  ]),

  // ④ warmth (T=업무 위주 / W=관계·정서형)
  likert(13, 'warmth', '업무와 상관없는 사적인 대화를 먼저 꺼낸다', { quick: true, reverse: true }),
  likert(14, 'warmth', '같이 밥을 먹어도 주로 일 얘기를 한다', { quick: true }),
  likert(15, 'warmth', '인사나 감사 표현 같은 예의를 중요하게 여긴다', { reverse: true }),
  likert(16, 'warmth', '팀 분위기나 사람 사이 관계보다 결과를 우선한다'),
  situation(4, 'warmth', '네가 실수했을 때 상사는?', [
    ['원인과 해결책만 말하고 끝낸다', 80],
    ['실수를 짚고 "다음엔 이렇게 하자"고 한다', 20],
    ['"괜찮아, 처음엔 다 그래"라고 먼저 위로한다', -60],
    ['실수보다 내 기분이나 상태를 먼저 묻는다', -90],
  ]),

  // ⑤ speed (즉시형 / 여유형) — 정밀 모드에만 포함
  likert(17, 'speed', '메신저에 바로 답하지 않으면 다시 연락이 온다'),
  likert(18, 'speed', '급하지 않은 일은 여유 있게 처리해도 괜찮아한다', { reverse: true }),
  likert(19, 'speed', '"지금 바로", "ASAP" 같은 말을 자주 쓴다'),
  likert(20, 'speed', '생각할 시간이 필요하다며 결정을 미룰 때가 있다', { reverse: true }),

  // ⑥ stability (안정형 / 기복형) — 정밀 모드에만 포함
  likert(21, 'stability', '기분에 따라 같은 일에도 반응이 달라진다', { reverse: true }),
  likert(22, 'stability', '화가 나도 목소리나 표정이 크게 달라지지 않는다'),
  likert(23, 'stability', '컨디션이 안 좋은 날은 팀원 모두가 눈치를 본다', { reverse: true }),
  likert(24, 'stability', '칭찬이나 지적의 기준이 일정하다'),
];

export function isSituation(question: Question): question is SituationQuestion {
  return 'options' in question;
}

export function getQuestion(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

function questionsFor(mode: Mode): Question[] {
  return mode === 'full' ? [...QUESTIONS] : QUESTIONS.filter((q) => q.quick);
}

export function getRequiredIds(mode: Mode): string[] {
  return questionsFor(mode).map((q) => q.id);
}

// API 응답용: axis, reverse, score 같은 채점 정보는 제외한다.
export function getPublicQuestions(mode: Mode): PublicQuestion[] {
  return questionsFor(mode).map((q) =>
    isSituation(q)
      ? { id: q.id, text: q.text, options: q.options.map(({ key, text }) => ({ key, text })) }
      : { id: q.id, text: q.text },
  );
}

export type NarrativeMeta =
  | { id: string; label: string; type: 'tags'; max: number }
  | { id: string; label: string; type: 'text' }
  | { id: string; label: string; type: 'pairs'; max: number; hint: string };

export const NARRATIVE_QUESTIONS: readonly NarrativeMeta[] = [
  { id: 'W1', label: '상사가 자주 하는 말', type: 'tags', max: 3 },
  { id: 'W2', label: '상사가 불만이거나 화났을 때 나오는 신호', type: 'text' },
  { id: 'W3', label: '상사가 기분 좋을 때 나오는 신호', type: 'text' },
  { id: 'W4', label: '상사가 특히 싫어하는 것', type: 'text' },
  { id: 'W5', label: '상사가 특히 중요하게 여기는 것', type: 'text' },
  {
    id: 'W6',
    label: '실제로 상사가 했던 말과 그게 진짜 무슨 뜻이었는지',
    type: 'pairs',
    max: 3,
    hint: '이거 쓰면 훨씬 정확해져요',
  },
];
