import { AppError } from '../lib/AppError.js';
import { buildSystemPrompt, getResponseSchema } from '../persona/promptBuilder.js';
import type { PromptInput } from '../persona/promptBuilder.js';
import { buildRuleLines } from '../persona/rules.js';
import { applyAdjust, getTypeName } from '../persona/scoring.js';
import type { PersonaScores } from '../persona/types.js';
import type { SupervisorRow } from '../services/supervisorMapper.js';
import type { GeminiClient, GeminiContent } from './gemini.js';

export const DEFAULT_MODEL = 'gemini-3.8-flash';

// 기본은 gemini-3.8-flash. (gemini-2.5-* 는 신규 프로젝트에서 막혀 있다.) GEMINI_MODEL 로 바꿀 수 있다.
export function getModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}
export const TEMPERATURE = 0.4;
export const TIMEOUT_MS = 30_000;
export const THINKING_LEVEL = 'LOW';
export const MAX_HISTORY = 10;

const RETRY_INSTRUCTION = '위 상사 프로필을 근거로 persona_basis를 채워서 다시 답하라';
const CONFIDENCES = ['high', 'medium', 'low'] as const;

export interface HistoryMessage {
  role: 'user' | 'ai';
  text: string | null;
}

export interface AiAnswer {
  intent: string;
  confidence: (typeof CONFIDENCES)[number];
  persona_basis: string[];
  recommended_action: string;
  suggested_message: string;
  avoid: string;
  follow_up_question: string | null;
  safety_flag: boolean;
}

// score_adjust 가 있으면 보정을 적용한 점수로 규칙을 만든다.
function effectiveScores(row: Pick<SupervisorRow, 'scores' | 'score_adjust'>): PersonaScores {
  const adjust = row.score_adjust ?? {};
  return Object.keys(adjust).length > 0 ? applyAdjust(row.scores, adjust) : row.scores;
}

// DB 상사 행 -> 시스템 프롬프트 입력. (learnedNotes 는 buildSystemPrompt 가 최근 10개만 쓴다)
export function toPromptInput(row: SupervisorRow): PromptInput {
  const persona = effectiveScores(row);
  return {
    nickname: row.nickname,
    position: row.position,
    code: persona.code,
    typeName: getTypeName(persona.code)?.typeName ?? null,
    channel: row.channel,
    ruleLines: buildRuleLines(persona),
    W1: row.catchphrases,
    W2: row.anger_signals,
    W3: row.happy_signals,
    W4: row.dislikes,
    W5: row.values_text,
    W6: row.examples.map((example) => ({ 발언: example.said, 의미: example.meant })),
    learnedNotes: row.learned_notes,
  };
}

// 최근 MAX_HISTORY 개만 쓰고 ai -> model 로 바꾼다. 맨 앞의 model 턴(첫 인사 등)은 빼서 user 턴으로 시작하게 한다.
export function toContents(history: HistoryMessage[], userText: string): GeminiContent[] {
  const turns: GeminiContent[] = history
    .slice(-MAX_HISTORY)
    .filter((message) => message.text !== null && message.text.trim() !== '')
    .map((message) => ({
      role: message.role === 'ai' ? 'model' : 'user',
      parts: [{ text: message.text as string }],
    }));
  while (turns.length > 0 && turns[0].role === 'model') turns.shift();
  return [...turns, { role: 'user', parts: [{ text: userText }] }];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

// JSON 이 깨졌거나, 필수 필드가 없거나, persona_basis 가 비었거나, 허용 밖 값이면 null.
export function parseAnswer(raw: string): AiAnswer | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;

  if (!isNonEmptyString(d.intent)) return null;
  if (!(CONFIDENCES as readonly unknown[]).includes(d.confidence)) return null;
  if (!Array.isArray(d.persona_basis) || !d.persona_basis.every((v) => typeof v === 'string')) return null;
  const personaBasis = (d.persona_basis as string[]).map((v) => v.trim()).filter((v) => v !== '');
  if (personaBasis.length === 0) return null;
  if (!isNonEmptyString(d.recommended_action)) return null;
  if (!isNonEmptyString(d.suggested_message)) return null;
  if (typeof d.avoid !== 'string') return null;
  if (d.follow_up_question !== undefined && d.follow_up_question !== null && typeof d.follow_up_question !== 'string') {
    return null;
  }
  if (typeof d.safety_flag !== 'boolean') return null;

  return {
    intent: d.intent.trim(),
    confidence: d.confidence as AiAnswer['confidence'],
    persona_basis: personaBasis,
    recommended_action: d.recommended_action.trim(),
    suggested_message: d.suggested_message.trim(),
    avoid: d.avoid,
    follow_up_question: isNonEmptyString(d.follow_up_question) ? d.follow_up_question.trim() : null,
    safety_flag: d.safety_flag,
  };
}

export interface AskSituationInput {
  supervisor: SupervisorRow;
  history: HistoryMessage[];
  userText: string;
}

// Gemini 호출 자체가 실패하면 client 가 502 AI_UNAVAILABLE 을 던진다. 응답이 올바르지 않으면 딱 1회만 다시 묻는다.
export async function askSituation(input: AskSituationInput, client: GeminiClient): Promise<AiAnswer> {
  const systemInstruction = buildSystemPrompt(toPromptInput(input.supervisor));
  const responseSchema = getResponseSchema();
  const contents = toContents(input.history, input.userText);

  const call = (turns: GeminiContent[]) =>
    client.generateJson({
      model: getModel(),
      systemInstruction,
      contents: turns,
      temperature: TEMPERATURE,
      responseSchema,
      timeoutMs: TIMEOUT_MS,
      thinkingLevel: THINKING_LEVEL,
    });

  const first = parseAnswer(await call(contents));
  if (first) return first;

  const retry = parseAnswer(await call([...contents, { role: 'user', parts: [{ text: RETRY_INSTRUCTION }] }]));
  if (retry) return retry;

  throw new AppError(502, 'AI_RESPONSE_INVALID', 'AI 응답을 이해하지 못했어요. 잠시 후 다시 시도해주세요');
}

// 저장용 한 줄 요약: intent 한 줄 + 추천 행동 한 줄
export function summarize(answer: AiAnswer): string {
  return `${answer.intent}\n${answer.recommended_action}`;
}
