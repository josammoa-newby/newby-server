import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGeminiClient } from '../../src/ai/gemini.js';
import { getModel } from '../../src/ai/situation.js';
import { CASES } from './cases.js';
import type { EvalCase } from './cases.js';
import { evaluate } from './evaluate.js';
import { BOSSES, BOSS_KEYS } from './fixtures.js';
import type { BossKey } from './fixtures.js';
import { judgeCase } from './judge.js';
import type { JudgeVerdicts } from './judge.js';
import { buildReport } from './report.js';
import { runAll, withBackoff } from './run.js';

const OUT_DIR = join(process.cwd(), 'eval-results');

interface Options {
  judge: boolean;
  only: number[] | null;
  boss: BossKey | null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const options: Options = { judge: false, only: null, boss: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--judge') {
      options.judge = true;
    } else if (arg === '--only') {
      const value = argv[++i];
      const ids = (value ?? '').split(',').map(Number);
      if (!value || ids.some((id) => !CASES.some((c) => c.id === id))) {
        fail(`--only 에는 케이스 번호(1~${CASES.length})를 쉼표로 구분해 넣어주세요`);
      }
      options.only = ids;
    } else if (arg === '--boss') {
      const value = argv[++i] as BossKey;
      if (!BOSS_KEYS.includes(value)) fail(`--boss 는 ${BOSS_KEYS.join('|')} 중 하나여야 해요`);
      options.boss = value;
    } else {
      fail(`알 수 없는 옵션: ${arg}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.GEMINI_API_KEY) fail('GEMINI_API_KEY 가 설정되어 있지 않아요 (.env 확인)');

  const cases: EvalCase[] = CASES.filter((c) => !options.only || options.only.includes(c.id));
  const bosses = BOSSES.filter((b) => !options.boss || b.key === options.boss);
  const client = getGeminiClient();
  const model = getModel();
  const startedAt = new Date().toISOString();

  console.log(`모델 ${model} / 케이스 ${cases.length} x 상사 ${bosses.length} = ${cases.length * bosses.length}호출${options.judge ? ' + 평가자' : ''}`);

  const results = await runAll(cases, bosses, client, (result, done, total) => {
    const status = result.answer ? `ok safety=${result.answer.safety_flag}` : `FAIL ${result.error?.slice(0, 80)}`;
    console.log(`[${done}/${total}] case ${result.caseId} ${result.boss} ${result.seconds.toFixed(1)}s ${status}`);
  });

  let verdictsByCase: Record<number, JudgeVerdicts> | null = null;
  if (options.judge) {
    verdictsByCase = {};
    const judgeClient = withBackoff(client);
    for (const evalCase of cases) {
      if (evalCase.expectSafety) continue;
      try {
        verdictsByCase[evalCase.id] = await judgeCase(
          evalCase,
          results.filter((r) => r.caseId === evalCase.id),
          judgeClient,
        );
        console.log(`judge case ${evalCase.id}: ${Object.keys(verdictsByCase[evalCase.id]).length}개 항목`);
      } catch (err) {
        verdictsByCase[evalCase.id] = {};
        console.log(`judge case ${evalCase.id}: 실패 (${(err as { code?: string }).code ?? 'error'}) → 수동 확인`);
      }
    }
  }

  const findings = evaluate(results, verdictsByCase, cases);
  const report = buildReport({ model, judge: options.judge, startedAt }, results, findings, cases);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'report.md'), report, 'utf-8');
  writeFileSync(
    join(OUT_DIR, 'results.json'),
    JSON.stringify({ model, judge: options.judge, startedAt, results, findings }, null, 2),
    'utf-8',
  );

  const count = (status: string) => findings.filter((f) => f.status === status).length;
  console.log(`\n통과 ${count('pass')} / 실패 ${count('fail')} / 경고 ${count('warn')} / 수동 확인 ${count('manual')}`);
  console.log(`저장: ${join('eval-results', 'report.md')}, ${join('eval-results', 'results.json')}`);
}

main().catch((err) => {
  console.error(`평가 실행 실패: ${(err as Error).message}`);
  process.exit(1);
});
