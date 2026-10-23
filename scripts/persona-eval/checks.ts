// 자동 판정(순수 로직). 의미 판단이 필요한 항목은 judge.ts 가 맡는다.

export type Status = 'pass' | 'fail' | 'warn' | 'manual';

export interface CheckResult {
  status: Status;
  detail: string;
}

export type CheckName = 'schema' | 'persona_basis' | 'safety' | 'length' | 'diversity' | 'w6' | 'no_blame';

export const CHECK_NAMES: readonly CheckName[] = [
  'schema',
  'persona_basis',
  'safety',
  'length',
  'diversity',
  'w6',
  'no_blame',
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
