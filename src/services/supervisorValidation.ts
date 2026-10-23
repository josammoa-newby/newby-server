import { AppError } from '../lib/AppError.js';
import { getQuestion, getRequiredIds, NARRATIVE_QUESTIONS } from '../persona/questions.js';
import { validateAnswers } from '../persona/scoring.js';
import type { Answers, Mode } from '../persona/types.js';

export const CHANNELS = ['messenger', 'face', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];
export const MODES: readonly Mode[] = ['quick', 'full'];

export const MAX_NICKNAME = 20; // supervisor_profile.nickname check (1~20)
export const MAX_POSITION = 50;
export const MAX_TAG = 30;
export const MAX_TEXT = 300;
export const MAX_EXAMPLE_TEXT = 200;

// 개수 한도는 questions.ts 의 W 메타를 따른다. (W1 tags, W6 pairs)
function metaMax(id: string): number {
  const meta = NARRATIVE_QUESTIONS.find((q) => q.id === id);
  return meta && 'max' in meta ? meta.max : 0;
}
export const MAX_CATCHPHRASES = metaMax('W1');
export const MAX_EXAMPLES = metaMax('W6');

export interface Example {
  said: string;
  meant: string;
}

export interface NarrativeInput {
  catchphrases?: string[];
  angerSignals?: string | null;
  happySignals?: string | null;
  dislikes?: string | null;
  valuesText?: string | null;
  examples?: Example[];
}

export interface SupervisorCreateInput extends NarrativeInput {
  nickname: string;
  position: string | null;
  channel: Channel;
  mode: Mode;
  answers: Answers;
}

export interface SupervisorPatchInput extends NarrativeInput {
  nickname?: string;
  position?: string | null;
  channel?: Channel;
  mode?: Mode;
  answers?: Answers;
}

const NARRATIVE_FIELDS = ['catchphrases', 'angerSignals', 'happySignals', 'dislikes', 'valuesText', 'examples'] as const;
const BASE_FIELDS = ['nickname', 'position', 'channel', 'mode', 'answers'] as const;
const ALLOWED_FIELDS: readonly string[] = [...BASE_FIELDS, ...NARRATIVE_FIELDS];

function invalid(message: string): never {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    invalid('요청 본문이 올바르지 않아요');
  }
  return body as Record<string, unknown>;
}

// id, user_id 를 포함해 허용 목록 밖의 필드는 모두 거절한다.
function rejectUnknownFields(b: Record<string, unknown>): void {
  const rejected = Object.keys(b).filter((key) => !ALLOWED_FIELDS.includes(key));
  if (rejected.length > 0) invalid(`수정할 수 없는 항목이에요: ${rejected.join(', ')}`);
}

export function parseNickname(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') invalid('상사 이름(별명)을 입력해주세요');
  const nickname = value.trim();
  if (nickname.length > MAX_NICKNAME) invalid(`상사 이름은 ${MAX_NICKNAME}자 이하로 입력해주세요`);
  return nickname;
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid(`${label} 값이 올바르지 않아요`);
  const trimmed = value.trim();
  if (trimmed.length > max) invalid(`${label}은(는) ${max}자 이하로 입력해주세요`);
  return trimmed === '' ? null : trimmed;
}

function parseChannel(value: unknown): Channel {
  if (typeof value !== 'string' || !(CHANNELS as readonly string[]).includes(value)) {
    invalid(`channel 은 ${CHANNELS.join(', ')} 중 하나여야 해요`);
  }
  return value as Channel;
}

export function parseMode(value: unknown): Mode {
  if (typeof value !== 'string' || !(MODES as readonly string[]).includes(value)) {
    invalid(`mode 는 ${MODES.join(', ')} 중 하나여야 해요`);
  }
  return value as Mode;
}

function parseAnswersObject(value: unknown): Answers {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    invalid('answers 는 문항 id 를 키로 하는 객체여야 해요');
  }
  return value as Answers;
}

function parseCatchphrases(value: unknown): string[] {
  if (!Array.isArray(value)) invalid('자주 하는 말은 배열이어야 해요');
  if (value.some((v) => typeof v !== 'string')) invalid('자주 하는 말은 문자열이어야 해요');
  const tags = (value as string[]).map((v) => v.trim()).filter((v) => v !== '');
  if (tags.length > MAX_CATCHPHRASES) invalid(`자주 하는 말은 ${MAX_CATCHPHRASES}개까지 입력할 수 있어요`);
  if (tags.some((v) => v.length > MAX_TAG)) invalid(`자주 하는 말은 하나당 ${MAX_TAG}자 이하로 입력해주세요`);
  return tags;
}

function parseExamples(value: unknown): Example[] {
  if (!Array.isArray(value)) invalid('examples 는 배열이어야 해요');
  if (value.length > MAX_EXAMPLES) invalid(`examples 는 ${MAX_EXAMPLES}개까지 입력할 수 있어요`);
  return value.map((item) => {
    const o = asObject(item);
    if (typeof o.said !== 'string' || typeof o.meant !== 'string' || o.said.trim() === '' || o.meant.trim() === '') {
      invalid('examples 는 said(상사가 한 말)와 meant(진짜 의미)를 모두 입력해야 해요');
    }
    const said = o.said.trim();
    const meant = o.meant.trim();
    if (said.length > MAX_EXAMPLE_TEXT || meant.length > MAX_EXAMPLE_TEXT) {
      invalid(`examples 는 각각 ${MAX_EXAMPLE_TEXT}자 이하로 입력해주세요`);
    }
    return { said, meant };
  });
}

// 보낸 서술형 필드만 파싱한다.
function parseNarrative(b: Record<string, unknown>): NarrativeInput {
  const out: NarrativeInput = {};
  if ('catchphrases' in b) out.catchphrases = parseCatchphrases(b.catchphrases);
  if ('angerSignals' in b) out.angerSignals = optionalText(b.angerSignals, '불만 신호', MAX_TEXT);
  if ('happySignals' in b) out.happySignals = optionalText(b.happySignals, '기분 좋을 때 신호', MAX_TEXT);
  if ('dislikes' in b) out.dislikes = optionalText(b.dislikes, '싫어하는 것', MAX_TEXT);
  if ('valuesText' in b) out.valuesText = optionalText(b.valuesText, '중요하게 여기는 것', MAX_TEXT);
  if ('examples' in b) out.examples = parseExamples(b.examples);
  return out;
}

// 알 수 없는 문항, 누락, 잘못된 값을 400 으로 거절한다. 누락은 문항 id 를 모두 알려준다.
export function assertAnswers(answers: Answers, mode: Mode): void {
  const result = validateAnswers(answers, mode);
  if (result.ok) return;

  const hasUnknown = Object.keys(answers).some((id) => !getQuestion(id));
  const missing = getRequiredIds(mode).filter((id) => answers[id] === undefined);
  if (!hasUnknown && missing.length > 0) {
    invalid(`응답하지 않은 문항이 있어요: ${missing.join(', ')}`);
  }
  invalid(result.message);
}

export function validateSupervisorCreate(body: unknown): SupervisorCreateInput {
  const b = asObject(body);
  rejectUnknownFields(b);

  const mode = b.mode === undefined ? 'quick' : parseMode(b.mode);
  if (b.answers === undefined) invalid('answers 를 입력해주세요');
  const answers = parseAnswersObject(b.answers);
  assertAnswers(answers, mode);

  return {
    nickname: parseNickname(b.nickname),
    position: optionalText(b.position, '직책', MAX_POSITION),
    channel: b.channel === undefined ? 'messenger' : parseChannel(b.channel),
    mode,
    answers,
    ...parseNarrative(b),
  };
}

export function validateSupervisorPatch(body: unknown): SupervisorPatchInput {
  const b = asObject(body);
  rejectUnknownFields(b);
  if (Object.keys(b).length === 0) invalid('수정할 항목을 입력해주세요');

  const patch: SupervisorPatchInput = {};
  if ('nickname' in b) patch.nickname = parseNickname(b.nickname);
  if ('position' in b) patch.position = optionalText(b.position, '직책', MAX_POSITION);
  if ('channel' in b) patch.channel = parseChannel(b.channel);
  if ('mode' in b) patch.mode = parseMode(b.mode);
  if ('answers' in b) {
    patch.answers = parseAnswersObject(b.answers);
    if (Object.keys(patch.answers).length === 0) invalid('수정할 응답을 입력해주세요');
  }
  return { ...patch, ...parseNarrative(b) };
}

export interface PatchPlan {
  mode: Mode;
  answers: Answers;
  // answers 나 mode 가 바뀌어 다시 채점해야 하는지
  rescore: boolean;
}

// 기존 answers 에 문항 id 단위로 병합하고, 결과를 검증한다. mode 는 quick -> full 승격만 허용한다.
export function planPatch(existing: { mode: Mode; answers: Answers }, patch: SupervisorPatchInput): PatchPlan {
  if (existing.mode === 'full' && patch.mode === 'quick') {
    invalid('정밀 모드에서 빠른 모드로 되돌릴 수 없어요');
  }

  const mode = patch.mode ?? existing.mode;
  const rescore = patch.answers !== undefined || mode !== existing.mode;
  const answers = patch.answers ? { ...existing.answers, ...patch.answers } : existing.answers;
  if (rescore) assertAnswers(answers, mode);

  return { mode, answers, rescore };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
