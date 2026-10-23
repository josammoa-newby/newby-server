import { CASES } from './cases.js';
import type { EvalCase } from './cases.js';
import { CHECK_NAMES, tally } from './checks.js';
import type { CheckName } from './checks.js';
import type { Finding } from './evaluate.js';
import { BOSS_KEYS, getBoss } from './fixtures.js';
import type { BossKey } from './fixtures.js';
import type { CallResult } from './run.js';

export interface ReportMeta {
  model: string;
  judge: boolean;
  startedAt: string;
}

const CHECK_LABELS: Record<CheckName, string> = {
  schema: 'a) 스키마',
  persona_basis: 'b) persona_basis',
  safety: 'c) 안전 플래그',
  length: 'd) 메시지 길이',
  tone: 'g) 반말 구어체',
  legal: 'h) 법적 단정 없음',
  code_abbrev: 'i) 코드 약어 없음',
  diversity: 'e) 상사별 해석 차이',
  w6: 'e) W6 예시 반영',
  no_blame: 'e) 비난·단정 없음',
  grounding: 'f) 근거 실재',
};

const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');

function bossHeader(key: BossKey): string {
  const row = getBoss(key).row;
  return `${key} ${row.nickname}(${row.channel})`;
}

export function buildReport(
  meta: ReportMeta,
  results: CallResult[],
  findings: Finding[],
  cases: readonly EvalCase[] = CASES,
): string {
  const lines: string[] = [];
  const failedCalls = results.filter((r) => !r.answer).length;
  const avg = results.length > 0 ? results.reduce((sum, r) => sum + r.seconds, 0) / results.length : 0;
  const modelCalls = results.reduce((sum, r) => sum + r.modelCalls, 0);

  lines.push('# 페르소나 적용 품질 평가 리포트', '');
  lines.push(`- 모델: \`${meta.model}\``);
  lines.push(`- 실행 시각: ${meta.startedAt}`);
  lines.push(`- 호출: ${results.length}건 (실패 ${failedCalls}건), 모델 호출 ${modelCalls}회, 평균 응답 시간 ${avg.toFixed(1)}초`);
  lines.push(`- 의미 판단 평가자(--judge): ${meta.judge ? '사용' : '사용 안 함 (해당 항목은 수동 확인)'}`, '');

  lines.push('## 요약', '', '| 항목 | 통과 | 실패 | 경고 | 수동 확인 |', '| --- | --- | --- | --- | --- |');
  for (const name of CHECK_NAMES) {
    const subset = findings.filter((f) => f.check === name);
    if (subset.length === 0) continue;
    const t = tally(subset);
    lines.push(`| ${CHECK_LABELS[name]} | ${t.pass} | ${t.fail} | ${t.warn} | ${t.manual} |`);
  }
  lines.push('');

  lines.push('## 케이스별 결과', '');
  for (const evalCase of cases) {
    const caseResults = results.filter((r) => r.caseId === evalCase.id);
    if (caseResults.length === 0) continue;
    const bosses = BOSS_KEYS.filter((key) => caseResults.some((r) => r.boss === key));
    const byBoss = (key: BossKey) => caseResults.find((r) => r.boss === key);

    lines.push(`### ${evalCase.id}. ${evalCase.label}${evalCase.expectSafety ? ' (안전 케이스: safety_flag true 기대)' : ''}`, '');
    lines.push(`> ${evalCase.text}`, '');
    lines.push(`| | ${bosses.map(bossHeader).join(' | ')} |`, `| --- | ${bosses.map(() => '---').join(' | ')} |`);

    const rows: [string, (r: CallResult) => string][] = [
      ['intent', (r) => r.answer!.intent],
      ['persona_basis', (r) => r.answer!.persona_basis.map((p) => `- ${p}`).join('\n')],
      ['recommended_action', (r) => r.answer!.recommended_action],
      ['suggested_message', (r) => r.answer!.suggested_message],
      ['confidence', (r) => r.answer!.confidence],
      ['follow_up_question', (r) => r.answer!.follow_up_question ?? '(없음)'],
      ['safety_flag', (r) => String(r.answer!.safety_flag)],
      ['응답 시간', (r) => `${r.seconds.toFixed(1)}초`],
    ];
    for (const [label, pick] of rows) {
      const values = bosses.map((key) => {
        const r = byBoss(key)!;
        return r.answer ? cell(pick(r)) : label === 'intent' ? `호출 실패: ${cell(r.error ?? '')}` : '-';
      });
      lines.push(`| ${label} | ${values.join(' | ')} |`);
    }

    const semantic = findings.filter((f) => f.caseId === evalCase.id && ['diversity', 'w6', 'no_blame', 'grounding'].includes(f.check));
    for (const f of semantic) {
      lines.push('', `- ${CHECK_LABELS[f.check]}${f.boss ? ` [${f.boss}]` : ''}: **${f.status}** ${f.detail}`);
    }
    lines.push('');
  }

  lines.push('## 실패 항목', '');
  const failures = findings.filter((f) => f.status === 'fail');
  if (failures.length === 0) {
    lines.push('없음', '');
  } else {
    for (const f of failures) {
      lines.push(`- 케이스 ${f.caseId}${f.boss ? ` / ${f.boss}` : ''} / ${CHECK_LABELS[f.check]}: ${f.detail}`);
    }
    lines.push('');
  }

  const warnings = findings.filter((f) => f.status === 'warn');
  if (warnings.length > 0) {
    lines.push('## 경고 (권장 기준 초과)', '');
    for (const f of warnings) lines.push(`- 케이스 ${f.caseId}${f.boss ? ` / ${f.boss}` : ''} / ${CHECK_LABELS[f.check]}: ${f.detail}`);
    lines.push('');
  }

  return lines.join('\n');
}
