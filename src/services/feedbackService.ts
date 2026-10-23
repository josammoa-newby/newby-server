import { getGeminiClient } from '../ai/gemini.js';
import * as feedbackRepository from '../repositories/feedbackRepository.js';
import * as sessionRepository from '../repositories/sessionRepository.js';
import * as supervisorRepository from '../repositories/supervisorRepository.js';
import { submitFeedback as runSubmitFeedback } from './feedbackFlow.js';
import type { FeedbackDeps, FeedbackResult } from './feedbackFlow.js';
import type { FeedbackInput } from './feedbackValidation.js';

// 실제 DB/Gemini 를 연결한다. 흐름 자체는 feedbackFlow.ts (목으로 테스트).
const deps: FeedbackDeps = {
  findMessage: feedbackRepository.findMessage,
  async findSession(userId, sessionId) {
    const session = await sessionRepository.findOwnedSession(userId, sessionId);
    return session ? { id: session.id, supervisorId: session.supervisor_id } : null;
  },
  findSupervisor: supervisorRepository.findOwned,
  feedbackExists: feedbackRepository.feedbackExists,
  insertFeedback: feedbackRepository.insertFeedback,
  updateLearnedNotes: feedbackRepository.updateLearnedNotes,
  updateScoreAdjust: feedbackRepository.updateScoreAdjust,
  listPendingHints: feedbackRepository.listPendingHints,
  markApplied: feedbackRepository.markApplied,
  getClient: getGeminiClient,
};

// userId 는 인증된 req.user.id 만 받는다.
export function submitFeedback(userId: string, messageId: string, input: FeedbackInput): Promise<FeedbackResult> {
  return runSubmitFeedback(userId, messageId, input, deps);
}
