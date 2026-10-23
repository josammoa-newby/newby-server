import { CASES } from './cases.js';
import type { EvalCase } from './cases.js';
import {
  checkLength,
  checkPersonaBasis,
  checkSafety,
  checkSchema,
} from './checks.js';
import type { CheckName, Status } from './checks.js';
import { getBoss } from './fixtures.js';
import type { BossKey } from './fixtures.js';
import type { JudgeVerdicts } from './judge.js';
import type { CallResult } from './run.js';

export interface Finding {
  check: CheckName;
  caseId: number;
  boss: BossKey | null;
  status: Status;
  detail: string;
}

// 의미 판단이 필요한 항목을 평가자(--judge)가 판정한 결과로 채운다. judge 가 없으면 "수동 확인".
function judged(
  verdicts: JudgeVerdicts | null,
  key: string,
  check: CheckName,
  caseId: number,
  boss: BossKey | null,
): Finding {
  if (verdicts === null) return { check, caseId, boss, status: 'manual', detail: '수동 확인 (--judge 없이 실행)' };
  const verdict = verdicts[key];
  if (!verdict) return { check, caseId, boss, status: 'manual', detail: '평가자 응답에 없어 수동 확인 필요' };
  return { check, caseId, boss, status: verdict.pass ? 'pass' : 'fail', detail: verdict.reason };
}

export function evaluate(
  results: CallResult[],
  verdictsByCase: Record<number, JudgeVerdicts> | null,
  cases: readonly EvalCase[] = CASES,
): Finding[] {
  const findings: Finding[] = [];
  const add = (check: CheckName, caseId: number, boss: BossKey | null, status: Status, detail: string) =>
    findings.push({ check, caseId, boss, status, detail });

  for (const result of results) {
    const evalCase = cases.find((c) => c.id === result.caseId)!;
    const row = getBoss(result.boss).row;

    if (!result.answer) {
      add('schema', result.caseId, result.boss, 'fail', `호출 실패: ${result.error ?? '알 수 없음'}`);
      continue;
    }
    const a = result.answer;

    const schema = checkSchema(a);
    add('schema', result.caseId, result.boss, schema.status, schema.detail);

    const basis = checkPersonaBasis(a.persona_basis);
    add('persona_basis', result.caseId, result.boss, basis.status, basis.detail);

    const safety = checkSafety(a.safety_flag, evalCase.expectSafety);
    add('safety', result.caseId, result.boss, safety.status, safety.detail);

    const length = checkLength(a.suggested_message, row.channel, row.scores.reporting?.letter === 'R');
    add('length', result.caseId, result.boss, length.status, length.detail);
  }

  // 케이스 단위 의미 판단 (안전 케이스는 해석 차이를 보지 않는다)
  for (const evalCase of cases) {
    if (evalCase.expectSafety) continue;
    const caseResults = results.filter((r) => r.caseId === evalCase.id && r.answer);
    if (caseResults.length === 0) continue;
    const verdicts = verdictsByCase ? (verdictsByCase[evalCase.id] ?? {}) : null;

    if (caseResults.length >= 2) findings.push(judged(verdicts, 'diversity', 'diversity', evalCase.id, null));
    if (evalCase.id === 1 && caseResults.some((r) => r.boss === 'IC')) {
      findings.push(judged(verdicts, 'w6:IC', 'w6', evalCase.id, 'IC'));
    }
    if (evalCase.id === 4 || evalCase.id === 9) {
      for (const r of caseResults) findings.push(judged(verdicts, `no_blame:${r.boss}`, 'no_blame', evalCase.id, r.boss));
    }
  }

  return findings;
}
