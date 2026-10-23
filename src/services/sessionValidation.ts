import { AppError } from '../lib/AppError.js';
import { isUuid } from './supervisorValidation.js';

export const MAX_MESSAGE_LENGTH = 1000;

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
