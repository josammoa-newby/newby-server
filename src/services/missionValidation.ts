import { AppError } from '../lib/AppError.js';

export const MAX_TITLE = 100;
export const DEFAULT_XP = 10;
export const MAX_XP = 100;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MissionCreateInput {
  date: string;
  title: string;
  xp: number;
}

function invalid(message: string): never {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// 한국 시간 기준 오늘 (YYYY-MM-DD)
export function todayKst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function readDate(value: unknown): string {
  if (value === undefined) return todayKst();
  if (!isValidDate(value)) invalid('date 는 YYYY-MM-DD 형식이어야 합니다.');
  return value;
}

export function validateMissionDateQuery(query: unknown): string {
  const q = isObject(query) ? query : {};
  return readDate(q.date);
}

export function validateMissionCreate(body: unknown): MissionCreateInput {
  if (!isObject(body)) invalid('요청 본문이 올바르지 않습니다.');
  if (typeof body.title !== 'string') invalid('title 은 문자열이어야 합니다.');
  const title = body.title.trim();
  if (!title) invalid('title 을 입력해 주세요.');
  if (title.length > MAX_TITLE) invalid(`title 은 ${MAX_TITLE}자 이하여야 합니다.`);
  let xp = DEFAULT_XP;
  if (body.xp !== undefined) {
    if (typeof body.xp !== 'number' || !Number.isInteger(body.xp) || body.xp < 1 || body.xp > MAX_XP) {
      invalid(`xp 는 1~${MAX_XP} 사이 정수여야 합니다.`);
    }
    xp = body.xp;
  }
  return { date: readDate(body.date), title, xp };
}

export function validateMissionDone(body: unknown): boolean {
  if (!isObject(body) || typeof body.done !== 'boolean') invalid('done(true/false)이 필요합니다.');
  return body.done;
}

export function validateMissionId(id: unknown): string {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new AppError(404, 'MISSION_NOT_FOUND', '미션을 찾을 수 없습니다.');
  }
  return id;
}
