import { AppError } from '../lib/AppError.js';

export const MAX_REACTION_LENGTH = 500;

export interface FeedbackInput {
  helpful: boolean;
  // helpful=false 이고 입력이 있을 때만 값이 있다
  actualReaction: string | null;
}

function invalid(message: string): never {
  throw new AppError(400, 'VALIDATION_ERROR', message);
}

export function validateFeedback(body: unknown): FeedbackInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    invalid('요청 본문이 올바르지 않아요');
  }
  const b = body as Record<string, unknown>;

  if (typeof b.helpful !== 'boolean') invalid('helpful 은 true/false 여야 해요');
  // helpful=true 일 때 actualReaction 은 무시한다.
  if (b.helpful) return { helpful: true, actualReaction: null };

  if (b.actualReaction === undefined || b.actualReaction === null) {
    return { helpful: false, actualReaction: null };
  }
  if (typeof b.actualReaction !== 'string') invalid('실제 반응은 문자열이어야 해요');
  const actualReaction = b.actualReaction.trim();
  if (actualReaction.length > MAX_REACTION_LENGTH) {
    invalid(`실제 반응은 ${MAX_REACTION_LENGTH}자 이하로 입력해주세요`);
  }
  return { helpful: false, actualReaction: actualReaction === '' ? null : actualReaction };
}
