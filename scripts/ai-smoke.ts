// OpenAI 스모크 테스트: 실제 호출 1회로 json_schema strict 응답이 오는지만 확인한다.
// 사용법: npm run ai:smoke   (다른 모델로 확인: OPENAI_MODEL=gpt-6.1-terra npm run ai:smoke)
// 출력은 통과/실패와 지연 시간뿐이다. 키와 응답 내용은 출력하지 않는다.
import 'dotenv/config';
import OpenAI from 'openai';
import { buildRequest, extractJsonText, getReasoningEffort } from '../src/ai/openai.js';
import type { GenerateJsonParams } from '../src/ai/openai.js';
import { getModel, TIMEOUT_MS } from '../src/ai/situation.js';
import { findStrictViolations } from '../src/ai/strictSchema.js';
import { getResponseSchema, RESPONSE_FIELDS } from '../src/persona/promptBuilder.js';

const CONFIDENCES = ['high', 'medium', 'low'];

function finish(passed: boolean, detail: string, startedAt?: number): never {
  const latency = startedAt === undefined ? '' : ` / 지연 ${Date.now() - startedAt}ms`;
  console.log(`결과: ${passed ? '통과' : '실패'} (${detail})${latency}`);
  process.exit(passed ? 0 : 1);
}

// 응답 JSON 이 스키마가 요구한 모양인지만 본다. (내용의 좋고 나쁨은 보지 않는다)
function shapeProblem(raw: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return 'JSON 이 아니에요';
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return '객체가 아니에요';
  const d = data as Record<string, unknown>;
  const keys = Object.keys(d).sort().join(',');
  if (keys !== [...RESPONSE_FIELDS].sort().join(',')) return '필드 구성이 스키마와 달라요';
  for (const field of ['intent', 'recommended_action', 'suggested_message', 'avoid']) {
    if (typeof d[field] !== 'string') return `${field} 타입이 달라요`;
  }
  if (!CONFIDENCES.includes(d.confidence as string)) return 'confidence 값이 달라요';
  if (!Array.isArray(d.persona_basis) || !d.persona_basis.every((v) => typeof v === 'string')) return 'persona_basis 타입이 달라요';
  if (d.follow_up_question !== null && typeof d.follow_up_question !== 'string') return 'follow_up_question 타입이 달라요';
  if (typeof d.safety_flag !== 'boolean') return 'safety_flag 타입이 달라요';
  return null;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) finish(false, 'OPENAI_API_KEY 가 설정되어 있지 않아요 (.env 확인)');

  let model: string;
  let effort: ReturnType<typeof getReasoningEffort>;
  try {
    model = getModel();
    effort = getReasoningEffort();
  } catch {
    return finish(false, 'OPENAI_REASONING_EFFORT 값이 올바르지 않아요');
  }
  console.log(`스모크 테스트: 모델 ${model} / reasoning ${effort}`);

  const schema = getResponseSchema();
  const violations = findStrictViolations(schema);
  if (violations.length > 0) finish(false, `요청 전 스키마 점검 실패 ${violations.length}건`);

  const params: GenerateJsonParams = {
    model,
    instructions:
      '너는 신입 사원을 돕는 상담 도우미다. 상사의 말에 담긴 의도를 해석해 JSON 으로만 답한다. persona_basis 에는 "스모크 테스트" 한 줄만 넣는다.',
    messages: [{ role: 'user', text: "보고서를 냈더니 상사가 '한번 더 검토해보자'라고 했어. 무슨 뜻일까?" }],
    schemaName: 'situation_answer',
    schema,
    reasoningEffort: effort,
    timeoutMs: TIMEOUT_MS,
  };

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const startedAt = Date.now();
  let response;
  try {
    response = await openai.responses.create(buildRequest(params), { timeout: params.timeoutMs });
  } catch (err) {
    // 상태 코드와 오류 코드만 알린다. (메시지와 본문은 출력하지 않는다)
    if (err instanceof OpenAI.APIError) {
      const code = err.code ?? err.type ?? 'unknown';
      const hint = err.status === 400 ? ' → 이 모델에서 구조화 출력이 거부됐을 수 있어요' : '';
      finish(false, `HTTP ${err.status ?? '?'}, code=${code}${hint}`, startedAt);
    }
    finish(false, `요청 실패(${(err as Error).name})`, startedAt);
  }

  let raw: string;
  try {
    raw = extractJsonText(response);
  } catch (err) {
    finish(false, `응답 처리 실패(${(err as { code?: string }).code ?? 'error'}) - refusal 또는 failed`, startedAt);
  }

  const problem = shapeProblem(raw);
  if (problem) finish(false, `스키마 불일치: ${problem}`, startedAt);
  finish(true, 'json_schema strict 응답 확인', startedAt);
}

main().catch(() => finish(false, '예상하지 못한 오류'));
