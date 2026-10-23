import type { GeminiClient } from '../../src/ai/gemini.js';
import { askSituation } from '../../src/ai/situation.js';
import type { AiAnswer } from '../../src/ai/situation.js';
import type { Boss, BossKey } from './fixtures.js';
import type { EvalCase } from './cases.js';

export const MAX_CONCURRENCY = 2;
export const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export interface CallResult {
  caseId: number;
  boss: BossKey;
  answer: AiAnswer | null;
  error: string | null;
  seconds: number;
  // 이 결과를 만드는 데 Gemini 를 부른 횟수 (백오프 재시도, 형식 오류 재시도 포함)
  modelCalls: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// gemini.ts 는 호출 실패를 상태 코드 구분 없이 502 AI_UNAVAILABLE 로 바꿔 던진다.
// 429/5xx 를 따로 알 수 없으므로 AI_UNAVAILABLE 이면 지수 백오프(1s, 2s, 4s)로 최대 3회 다시 시도한다.
export function withBackoff(inner: GeminiClient, onCall?: () => void): GeminiClient {
  return {
    async generateJson(params) {
      for (let attempt = 0; ; attempt++) {
        onCall?.();
        try {
          return await inner.generateJson(params);
        } catch (err) {
          const retryable = (err as { code?: string }).code === 'AI_UNAVAILABLE';
          if (!retryable || attempt >= MAX_RETRIES) throw err;
          await sleep(BASE_DELAY_MS * 2 ** attempt + Math.random() * 250);
        }
      }
    },
  };
}

// 호출 시작 간격을 intervalMs 이상으로 벌려 요청 한도(429)에 걸리지 않게 한다. 0 이면 제한 없음.
export function withPacing(inner: GeminiClient, intervalMs: number): GeminiClient {
  if (intervalMs <= 0) return inner;
  let nextSlot = 0;
  return {
    async generateJson(params) {
      const now = Date.now();
      const start = Math.max(now, nextSlot);
      nextSlot = start + intervalMs;
      if (start > now) await sleep(start - now);
      return inner.generateJson(params);
    },
  };
}

async function runOne(evalCase: EvalCase, boss: Boss, client: GeminiClient): Promise<CallResult> {
  let modelCalls = 0;
  const start = Date.now();
  try {
    const answer = await askSituation(
      { supervisor: boss.row, history: [], userText: evalCase.text },
      withBackoff(client, () => {
        modelCalls += 1;
      }),
    );
    return { caseId: evalCase.id, boss: boss.key, answer, error: null, seconds: (Date.now() - start) / 1000, modelCalls };
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      caseId: evalCase.id,
      boss: boss.key,
      answer: null,
      error: code ? `${code}: ${message}` : message,
      seconds: (Date.now() - start) / 1000,
      modelCalls,
    };
  }
}

// 케이스 x 상사 호출. 동시에 MAX_CONCURRENCY 개까지만 보낸다.
export async function runAll(
  cases: readonly EvalCase[],
  bosses: readonly Boss[],
  client: GeminiClient,
  onDone?: (result: CallResult, done: number, total: number) => void,
): Promise<CallResult[]> {
  const jobs = cases.flatMap((evalCase) => bosses.map((boss) => ({ evalCase, boss })));
  const results: CallResult[] = new Array(jobs.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < jobs.length) {
      const index = next++;
      const { evalCase, boss } = jobs[index];
      results[index] = await runOne(evalCase, boss, client);
      done += 1;
      onDone?.(results[index], done, jobs.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, jobs.length) }, worker));
  return results;
}
