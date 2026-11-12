import OpenAI from 'openai';
import { AppError } from '../lib/AppError.js';

export const REASONING_EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low';

export interface AiMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface GenerateJsonParams {
  model: string;
  instructions: string;
  messages: AiMessage[];
  // text.format 의 json_schema 이름과 스키마. strict 규칙(모든 필드 required, additionalProperties:false)을 지켜야 한다.
  schemaName: string;
  schema: Record<string, unknown>;
  reasoningEffort: ReasoningEffort;
  timeoutMs: number;
}

// 테스트에서는 이 인터페이스를 목으로 바꿔 끼운다. (실제 호출 금지)
export interface OpenAiClient {
  // 모델이 돌려준 JSON 문자열 원문을 그대로 반환한다.
  generateJson(params: GenerateJsonParams): Promise<string>;
}

const NOT_CONFIGURED = () => new AppError(500, 'AI_NOT_CONFIGURED', 'AI 기능이 아직 설정되지 않았어요');
const RESPONSE_INVALID = () =>
  new AppError(502, 'AI_RESPONSE_INVALID', 'AI 응답을 이해하지 못했어요. 잠시 후 다시 시도해주세요');

// reasoning.effort. 기본 low, OPENAI_REASONING_EFFORT 로 바꿀 수 있다. 허용 밖 값이면 설정 오류(500)로 본다.
// effort 가 none 이 아니면 temperature 를 보낼 수 없어서 temperature 는 어디서도 보내지 않는다.
export function getReasoningEffort(): ReasoningEffort {
  const value = process.env.OPENAI_REASONING_EFFORT;
  if (!value) return DEFAULT_REASONING_EFFORT;
  if ((REASONING_EFFORTS as readonly string[]).includes(value)) return value as ReasoningEffort;
  throw NOT_CONFIGURED();
}

// Responses API 요청 본문. 대화는 저장하지 않는다(store:false).
export function buildRequest(params: GenerateJsonParams) {
  return {
    model: params.model,
    instructions: params.instructions,
    input: params.messages.map((message) => ({ role: message.role, content: message.text })),
    text: {
      format: { type: 'json_schema' as const, name: params.schemaName, strict: true, schema: params.schema },
    },
    reasoning: { effort: params.reasoningEffort },
    store: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

interface ResponseLike {
  status?: string | null;
  output?: unknown;
  output_text?: unknown;
}

// 응답에서 JSON 문자열을 꺼낸다. 출력 항목에 refusal 이 하나라도 있으면 AI_RESPONSE_INVALID,
// 모델 호출 자체가 failed 로 끝났으면 AI_UNAVAILABLE. 그 외에는 output_text 를 그대로 돌려준다.
export function extractJsonText(response: ResponseLike): string {
  if (response.status === 'failed') {
    throw new AppError(502, 'AI_UNAVAILABLE', 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요');
  }
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type === 'refusal') throw RESPONSE_INVALID();
    if (item.type === 'message' && Array.isArray(item.content)) {
      if (item.content.some((part) => isRecord(part) && part.type === 'refusal')) throw RESPONSE_INVALID();
    }
  }
  return typeof response.output_text === 'string' ? response.output_text : '';
}

let cached: { key: string; client: OpenAiClient } | null = null;

// 키는 process.env.OPENAI_API_KEY 만 사용한다. 키가 없어도 서버 시작은 막지 않고, 호출할 때 500 으로 답한다.
export function getOpenAiClient(): OpenAiClient {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw NOT_CONFIGURED();
  // 값이 잘못됐으면 요청을 만들기 전에 설정 오류로 알린다.
  getReasoningEffort();
  if (cached?.key === key) return cached.client;

  // SDK 의 자동 재시도는 끈다. 30초 제한이 재시도까지 합쳐 늘어나지 않게 하고, 재시도는 호출하는 쪽이 정한다.
  const openai = new OpenAI({ apiKey: key, maxRetries: 0 });
  const client: OpenAiClient = {
    async generateJson(params) {
      let response;
      try {
        response = await openai.responses.create(buildRequest(params), { timeout: params.timeoutMs });
      } catch (err) {
        // 키, 요청 전문, 응답 본문은 남기지 않고 오류 종류와 상태 코드만 기록한다.
        const status = (err as { status?: number }).status;
        console.error(`OpenAI request failed: ${(err as Error).name}${status ? ` (${status})` : ''}`);
        throw new AppError(502, 'AI_UNAVAILABLE', 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요');
      }
      return extractJsonText(response);
    },
  };
  cached = { key, client };
  return client;
}
