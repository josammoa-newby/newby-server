import { AppError } from '../lib/AppError.js';
import { isUuid } from './supervisorValidation.js';

export const MAX_MESSAGE_LENGTH = 1000;
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 50;

function invalid(message: string): never {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    invalid('요청 본문이 올바르지 않아요');
  }
  return body as Record<string, unknown>;
}

// supervisorId 형식이 틀리면 없는 상사와 같은 404 로 답한다. (존재 여부를 구분해서 알려주지 않는다)
export function validateCreateSession(body: unknown): { supervisorId: string } {
  const b = asObject(body);
  if (typeof b.supervisorId !== 'string' || b.supervisorId.trim() === '') {
    invalid('supervisorId를 입력해주세요');
  }
  const supervisorId = b.supervisorId.trim();
  if (!isUuid(supervisorId)) {
    throw new AppError(404, 'SUPERVISOR_NOT_FOUND', '상사 정보를 찾을 수 없어요');
  }
  return { supervisorId };
}

export function validateMessage(body: unknown): { text: string } {
  const b = asObject(body);
  if (typeof b.text !== 'string' || b.text.trim() === '') {
    invalid('메시지를 입력해주세요');
  }
  const text = b.text.trim();
  if (text.length > MAX_MESSAGE_LENGTH) {
    invalid(`메시지는 ${MAX_MESSAGE_LENGTH}자 이하로 입력해주세요`);
  }
  return { text };
}

export interface SessionListQuery {
  supervisorId?: string;
  limit: number;
}

// supervisorId 는 uuid 형식이어야 한다. (형식이 틀리면 400, 내 상사가 아니면 서비스가 빈 배열로 답한다)
export function validateSessionListQuery(query: unknown): SessionListQuery {
  const q = typeof query === 'object' && query !== null && !Array.isArray(query) ? (query as Record<string, unknown>) : {};
  const result: SessionListQuery = { limit: DEFAULT_LIST_LIMIT };
  if (q.supervisorId !== undefined) {
    if (!isUuid(q.supervisorId)) invalid('supervisorId 형식이 올바르지 않아요');
    result.supervisorId = q.supervisorId;
  }
  if (q.limit !== undefined) {
    const n = typeof q.limit === 'string' && /^\d+$/.test(q.limit) ? Number(q.limit) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIST_LIMIT) {
      invalid(`limit 은 1~${MAX_LIST_LIMIT} 사이 정수여야 해요`);
    }
    result.limit = n;
  }
  return result;
}
