import { scorePersona } from '../../src/persona/scoring.js';
import type { Answers } from '../../src/persona/types.js';
import type { SupervisorRow } from '../../src/services/supervisorMapper.js';

export type BossKey = 'DC' | 'DA' | 'IC' | 'IA';
export const BOSS_KEYS: readonly BossKey[] = ['DC', 'DA', 'IC', 'IA'];

export interface Boss {
  key: BossKey;
  // 이 상사의 규칙 줄/프롬프트를 만드는 데 쓰는 인메모리 DB 행 (DB 접근 없음)
  row: SupervisorRow;
}

// src/persona/scoring.test.ts 의 대표 응답 세트(정밀 모드)를 그대로 가져왔다.
const SPEED_STABILITY: Answers = { L17: 5, L18: 1, L19: 5, L20: 1, L21: 1, L22: 5, L23: 1, L24: 5 };
const DIRECT: Answers = { L1: 5, L2: 1, L3: 5, L4: 1, S1: 'a' };
const INDIRECT: Answers = { L1: 1, L2: 5, L3: 1, L4: 5, S1: 'd' };
const CONTROL: Answers = { L5: 5, L6: 1, L7: 5, L8: 1, S2: 'a' };
const AUTONOMY: Answers = { L5: 1, L6: 5, L7: 1, L8: 5, S2: 'd' };
const REPORT_RESULT: Answers = { L9: 5, L10: 1, L11: 5, L12: 1, S3: 'a' };
const TASK_ORIENTED: Answers = { L13: 1, L14: 5, L15: 1, L16: 5, S4: 'a' };

const ANSWER_SETS: Record<BossKey, Answers> = {
  DC: { ...DIRECT, ...CONTROL, ...REPORT_RESULT, ...TASK_ORIENTED, ...SPEED_STABILITY },
  DA: { ...DIRECT, ...AUTONOMY, ...REPORT_RESULT, ...TASK_ORIENTED, ...SPEED_STABILITY },
  IC: { ...INDIRECT, ...CONTROL, ...REPORT_RESULT, ...TASK_ORIENTED, ...SPEED_STABILITY },
  IA: { ...INDIRECT, ...AUTONOMY, ...REPORT_RESULT, ...TASK_ORIENTED, ...SPEED_STABILITY },
};

interface Profile {
  nickname: string;
  position: string;
  channel: 'messenger' | 'face';
  catchphrases: string[];
  angerSignals: string;
  happySignals: string;
  dislikes: string;
  valuesText: string;
  examples: { said: string; meant: string }[];
}

const PROFILES: Record<BossKey, Profile> = {
  DC: {
    nickname: '김팀장',
    position: '팀장',
    channel: 'messenger',
    catchphrases: ['그래서 결론이 뭐야?', '일정은?', '다시 확인해봐'],
    angerSignals: '메신저 답이 한두 단어로 짧아지고, 말없이 수정 사항만 줄줄이 보낸다',
    happySignals: '"오케이"라고 짧게 답하고 다음 업무를 바로 맡긴다',
    dislikes: '늦은 보고, 오타, 결론 없이 긴 메시지',
    valuesText: '정확성과 마감 준수',
    examples: [],
  },
  DA: {
    nickname: '박선임',
    position: '선임',
    channel: 'face',
    catchphrases: ['아닌 건 아니라고 말할게', '알아서 해봐', '막히면 말해'],
    angerSignals: '표정이 굳고 바로 어디가 문제인지 짚는다',
    happySignals: '"좋아, 이대로 가자"라며 칭찬 없이 다음 일을 맡긴다',
    dislikes: '같은 질문을 여러 번 하는 것, 스스로 판단 안 하고 기다리는 것',
    valuesText: '주도성과 책임감',
    examples: [],
  },
  IC: {
    nickname: '이실장',
    position: '실장',
    channel: 'face',
    catchphrases: ['음, 한번 생각해보자', '괜찮긴 한데…', '나중에 다시 보자'],
    angerSignals: '말수가 줄고 같은 자료를 두 번 세 번 다시 열어본다',
    happySignals: '"수고했어"라고 먼저 인사하고 간식을 사 온다',
    dislikes: '세부 내용을 확인하지 않고 올리는 보고, 사전 공유 없는 변경',
    valuesText: '꼼꼼함과 사전 공유',
    // IC 상사에게만 실제 발언 예시를 넣는다.
    examples: [{ said: '한번 더 검토해보자', meant: '처음부터 다시 해오라는 뜻' }],
  },
  IA: {
    nickname: '최부장',
    position: '부장',
    channel: 'messenger',
    catchphrases: ['알아서 잘하겠지', '다음에 보자', '그건 자네가 판단해'],
    angerSignals: '아무 답이 없다가 다른 사람에게 일을 넘긴다',
    happySignals: '아무 말 없이 결재를 빨리 해준다',
    dislikes: '사소한 일로 자주 찾아오는 것, 보고를 위한 보고',
    valuesText: '자율성과 결과',
    examples: [],
  },
};

function buildBoss(key: BossKey): Boss {
  const profile = PROFILES[key];
  const answers = ANSWER_SETS[key];
  const scores = scorePersona(answers);
  const now = '2026-10-24T00:00:00.000Z';
  const row: SupervisorRow = {
    id: `00000000-0000-4000-8000-00000000000${BOSS_KEYS.indexOf(key) + 1}`,
    nickname: profile.nickname,
    position: profile.position,
    channel: profile.channel,
    mode: 'full',
    answers,
    scores,
    score_adjust: {},
    code: scores.code,
    catchphrases: profile.catchphrases,
    anger_signals: profile.angerSignals,
    happy_signals: profile.happySignals,
    dislikes: profile.dislikes,
    values_text: profile.valuesText,
    examples: profile.examples,
    learned_notes: [],
    is_default: key === 'DC',
    created_at: now,
    updated_at: now,
  };
  return { key, row };
}

export const BOSSES: readonly Boss[] = BOSS_KEYS.map(buildBoss);

export function getBoss(key: BossKey): Boss {
  return BOSSES.find((boss) => boss.key === key)!;
}
