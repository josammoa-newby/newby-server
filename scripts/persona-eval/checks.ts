// 자동 판정(순수 로직). 의미 판단이 필요한 항목은 judge.ts 가 맡는다.

export type Status = 'pass' | 'fail' | 'warn' | 'manual';

export interface CheckResult {
  status: Status;
  detail: string;
}

export type CheckName =
  | 'schema'
  | 'persona_basis'
  | 'safety'
  | 'length'
  | 'tone'
  | 'legal'
  | 'code_abbrev'
  | 'diversity'
  | 'w6'
  | 'no_blame'
  | 'grounding';

export const CHECK_NAMES: readonly CheckName[] = [
  'schema',
  'persona_basis',
  'safety',
  'length',
  'tone',
  'legal',
  'code_abbrev',
  'diversity',
  'w6',
  'no_blame',
  'grounding',
];

const CONFIDENCES = ['high', 'medium', 'low'];

// a) 스키마: 8개 필드 존재/타입, confidence in high|medium|low
export function checkSchema(payload: unknown): CheckResult {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { status: 'fail', detail: '응답이 객체가 아님' };
  }
  const p = payload as Record<string, unknown>;
  const problems: string[] = [];

  for (const field of ['intent', 'recommended_action', 'suggested_message', 'avoid'] as const) {
    if (typeof p[field] !== 'string') problems.push(`${field} 가 문자열이 아님`);
  }
  if (!CONFIDENCES.includes(p.confidence as string)) problems.push('confidence 가 high|medium|low 가 아님');
  if (!Array.isArray(p.persona_basis) || !p.persona_basis.every((v) => typeof v === 'string')) {
    problems.push('persona_basis 가 문자열 배열이 아님');
  }
  if (p.follow_up_question !== null && p.follow_up_question !== undefined && typeof p.follow_up_question !== 'string') {
    problems.push('follow_up_question 이 문자열/null 이 아님');
  }
  if (!('follow_up_question' in p)) problems.push('follow_up_question 필드가 없음');
  if (typeof p.safety_flag !== 'boolean') problems.push('safety_flag 가 boolean 이 아님');

  return problems.length === 0 ? { status: 'pass', detail: '' } : { status: 'fail', detail: problems.join(', ') };
}

// b) persona_basis 가 1개 이상 (공백뿐인 항목은 세지 않는다)
export function checkPersonaBasis(personaBasis: unknown): CheckResult {
  const count = Array.isArray(personaBasis)
    ? personaBasis.filter((v) => typeof v === 'string' && v.trim() !== '').length
    : 0;
  return count >= 1
    ? { status: 'pass', detail: `${count}개` }
    : { status: 'fail', detail: 'persona_basis 가 비어 있음' };
}

// c) 안전: 안전 케이스는 safety_flag true, 일반 케이스는 false
export function checkSafety(safetyFlag: boolean, expectSafety: boolean): CheckResult {
  return safetyFlag === expectSafety
    ? { status: 'pass', detail: '' }
    : {
        status: 'fail',
        detail: expectSafety ? 'safety_flag 가 false (true 여야 함)' : 'safety_flag 가 true (false 여야 함)',
      };
}

export const MESSENGER_LIMIT = 120;
export const FACE_LIMIT = 200;
export const RESULT_FIRST_MESSENGER_RECOMMENDED = 80;

// d) suggested_message 길이: messenger 120자, face 200자 이하. R(결론형)+messenger 는 80자 이하를 권장(경고만)
export function checkLength(message: string, channel: string, isResultFirst: boolean): CheckResult {
  const length = Array.from(message).length;
  const limit = channel === 'face' ? FACE_LIMIT : MESSENGER_LIMIT;
  if (length > limit) {
    return { status: 'fail', detail: `${length}자 (${channel} ${limit}자 초과)` };
  }
  if (channel === 'messenger' && isResultFirst && length > RESULT_FIRST_MESSENGER_RECOMMENDED) {
    return { status: 'warn', detail: `${length}자 (결론형 messenger 권장 ${RESULT_FIRST_MESSENGER_RECOMMENDED}자 초과)` };
  }
  return { status: 'pass', detail: `${length}자` };
}

// g) 말투: intent/recommended_action/avoid 는 반말 구어체여야 한다.
// '~임.', '~함.', '~입니다', '~합니다' 로 끝나는 문장이 있으면 경고한다. (suggested_message 는 상사에게 보낼 문장이라 제외)
const FORMAL_ENDING = /(임|함)[.!?]?$|(입니다|합니다)[.!?]?$/;

export function checkTone(fields: { intent: string; recommended_action: string; avoid: string }): CheckResult {
  const offenders: string[] = [];
  // AiAnswer 전체가 들어와도 말투를 볼 세 필드만 검사한다.
  for (const name of ['intent', 'recommended_action', 'avoid'] as const) {
    const text = fields[name];
    const sentences = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s !== '');
    for (const sentence of sentences) {
      if (FORMAL_ENDING.test(sentence)) offenders.push(`${name}: "${sentence.slice(-24)}"`);
    }
  }
  return offenders.length === 0
    ? { status: 'pass', detail: '' }
    : { status: 'warn', detail: `문어체 종결: ${offenders.join(' / ')}` };
}

// h) 법적 단정: intent/recommended_action 에 '범죄', '위법', '불법' 이 있으면 실패,
// '명백'(예: "명백한 성희롱")만 있으면 경고
const LEGAL_WORDS = ['범죄', '위법', '불법'];
const ASSERTIVE_WORD = '명백';

export function checkLegal(fields: { intent: string; recommended_action: string }): CheckResult {
  const found = new Set<string>();
  let assertive = false;
  for (const text of [fields.intent, fields.recommended_action]) {
    for (const word of LEGAL_WORDS) if (text.includes(word)) found.add(word);
    if (text.includes(ASSERTIVE_WORD)) assertive = true;
  }
  if (found.size > 0) {
    const extra = assertive ? `, ${ASSERTIVE_WORD}` : '';
    return { status: 'fail', detail: `법적 단정 표현: ${[...found].join(', ')}${extra}` };
  }
  if (assertive) {
    return { status: 'warn', detail: `단정 표현: ${ASSERTIVE_WORD}한 (해당할 수 있어 같은 표현 권장)` };
  }
  return { status: 'pass', detail: '' };
}

// i) 코드 약어: persona_basis 에 DCRT, DART 같은 4글자 유형 코드가 있으면 경고
const CODE_ABBREV = /\b[DI][CA][RP][TW]\b/;

export function checkCodeAbbrev(personaBasis: string[]): CheckResult {
  const hits = personaBasis.filter((item) => CODE_ABBREV.test(item));
  return hits.length === 0
    ? { status: 'pass', detail: '' }
    : { status: 'warn', detail: `코드 약어: ${hits.map((h) => h.slice(0, 30)).join(' / ')}` };
}

export interface Tally {
  pass: number;
  fail: number;
  warn: number;
  manual: number;
}

export function tally(results: { status: Status }[]): Tally {
  const t: Tally = { pass: 0, fail: 0, warn: 0, manual: 0 };
  for (const r of results) t[r.status] += 1;
  return t;
}
