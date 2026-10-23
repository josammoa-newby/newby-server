import { AppError } from '../lib/AppError.js';

export const MAX_CONTENT = 2000;
export const MAX_MOOD = 20;
export const DEFAULT_LIMIT = 30;
export const MAX_LIMIT = 100;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DiaryCreateInput {
  date: string;
  content: string;
  mood: string | null;
  source: 'manual' | 'ai_message';
  messageId: string | null;
}

export interface DiaryPatchInput {
  date?: string;
  content?: string;
  mood?: string | null;
}

export interface DiaryListQuery {
  from?: string;
  to?: string;
  limit: number;
}

function invalid(message: string): never {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// 한국 시간 기준 오늘 (YYYY-MM-DD)
export function todayKst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function readDate(value: unknown, field = 'date'): string {
  if (!isValidDate(value)) invalid(`${field} 는 YYYY-MM-DD 형식이어야 합니다.`);
  return value;
}

function readContent(value: unknown): string {
  if (typeof value !== 'string') invalid('content 는 문자열이어야 합니다.');
  const trimmed = value.trim();
  if (!trimmed) invalid('content 를 입력해 주세요.');
  if (trimmed.length > MAX_CONTENT) invalid(`content 는 ${MAX_CONTENT}자 이하여야 합니다.`);
  return trimmed;
}

function readMood(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') invalid('mood 는 문자열이어야 합니다.');
  const trimmed = value.trim();
  if (trimmed.length > MAX_MOOD) invalid(`mood 는 ${MAX_MOOD}자 이하여야 합니다.`);
  return trimmed || null;
}

export function validateDiaryCreate(body: unknown): DiaryCreateInput {
  if (!isObject(body)) invalid('요청 본문이 올바르지 않습니다.');
  const source = body.source ?? 'manual';
  if (source !== 'manual' && source !== 'ai_message') invalid("source 는 'manual' 또는 'ai_message' 여야 합니다.");
  let messageId: string | null = null;
  if (source === 'ai_message') {
    if (!isUuid(body.messageId)) invalid('ai_message 일기는 messageId(uuid)가 필요합니다.');
    messageId = body.messageId;
  }
  return {
    date: body.date === undefined ? todayKst() : readDate(body.date),
    content: readContent(body.content),
    mood: readMood(body.mood),
    source,
    messageId,
  };
}

export function validateDiaryPatch(body: unknown): DiaryPatchInput {
  if (!isObject(body)) invalid('요청 본문이 올바르지 않습니다.');
  const patch: DiaryPatchInput = {};
  if (body.date !== undefined) patch.date = readDate(body.date);
  if (body.content !== undefined) patch.content = readContent(body.content);
  if (body.mood !== undefined) patch.mood = readMood(body.mood);
  if (Object.keys(patch).length === 0) invalid('수정할 항목(date, content, mood)이 없습니다.');
  return patch;
}

export function validateDiaryListQuery(query: unknown): DiaryListQuery {
  const q = isObject(query) ? query : {};
  const result: DiaryListQuery = { limit: DEFAULT_LIMIT };
  if (q.from !== undefined) result.from = readDate(q.from, 'from');
  if (q.to !== undefined) result.to = readDate(q.to, 'to');
  if (result.from && result.to && result.from > result.to) invalid('from 은 to 보다 이후일 수 없습니다.');
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) invalid(`limit 은 1~${MAX_LIMIT} 사이 정수여야 합니다.`);
    result.limit = n;
  }
  return result;
}

export function validateDiaryId(id: unknown): string {
  if (!isUuid(id)) throw new AppError(404, 'DIARY_NOT_FOUND', '일기를 찾을 수 없습니다.');
  return id;
}
