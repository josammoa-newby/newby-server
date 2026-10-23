import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { Schema } from '@google/genai';
import { AppError } from '../lib/AppError.js';

export interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GenerateJsonParams {
  model: string;
  systemInstruction: string;
  contents: GeminiContent[];
  temperature: number;
  // 추론(thinking) 양. 지정하지 않으면 모델 기본값을 쓴다. (gemini-3.x 는 MINIMAL 을 지원하지 않아 LOW 가 가장 낮다)
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  responseSchema: unknown;
  timeoutMs: number;
}

// 테스트에서는 이 인터페이스를 목으로 바꿔 끼운다. (실제 호출 금지)
export interface GeminiClient {
  // 모델이 돌려준 JSON 문자열 원문을 그대로 반환한다.
  generateJson(params: GenerateJsonParams): Promise<string>;
}

let cached: { key: string; client: GeminiClient } | null = null;

// 키는 process.env.GEMINI_API_KEY 만 사용한다. 키가 없어도 서버 시작은 막지 않고, 호출할 때 500 으로 답한다.
export function getGeminiClient(): GeminiClient {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new AppError(500, 'AI_NOT_CONFIGURED', 'AI 기능이 아직 설정되지 않았어요');
  }
  if (cached?.key === key) return cached.client;

  const ai = new GoogleGenAI({ apiKey: key });
  const client: GeminiClient = {
    async generateJson(params) {
      try {
        const response = await ai.models.generateContent({
          model: params.model,
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            temperature: params.temperature,
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema as Schema,
            ...(params.thinkingLevel && { thinkingConfig: { thinkingLevel: ThinkingLevel[params.thinkingLevel] } }),
            abortSignal: AbortSignal.timeout(params.timeoutMs),
            httpOptions: { timeout: params.timeoutMs },
          },
        });
        return response.text ?? '';
      } catch (err) {
        // 키, 요청 전문, 응답 본문은 남기지 않고 오류 종류와 상태 코드만 기록한다.
        const status = (err as { status?: number }).status;
        console.error(`Gemini request failed: ${(err as Error).name}${status ? ` (${status})` : ''}`);
        throw new AppError(502, 'AI_UNAVAILABLE', 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요');
      }
    },
  };
  cached = { key, client };
  return client;
}
