// 피드백 처리 흐름. DB/Gemini 접근은 deps 로 주입받아 목으로 테스트할 수 있다. (supabase 를 직접 import 하지 않는다)
import { analyzeFeedback, summarizeNotes } from '../ai/feedback.js';
import type { AxisHint, FeedbackAnalysis } from '../ai/feedback.js';
import type { GeminiClient } from '../ai/gemini.js';
import { AppError } from '../lib/AppError.js';
import type { Axis } from '../persona/types.js';
import type { SupervisorRow } from './supervisorMapper.js';
import { isUuid } from './supervisorValidation.js';
import type { FeedbackInput } from './feedbackValidation.js';

export const MAX_LEARNED_NOTES = 10;
export const NOTES_TO_SUMMARIZE = 5;
export const APPLY_THRESHOLD = 2;
export const ADJUST_STEP = 10;

export class FeedbackExistsError extends Error {
  constructor() {
    super('Feedback already exists');
    this.name = 'FeedbackExistsError';
  }
}

export interface PendingHint {
  id: string;
  axis: Axis;
  dir: 1 | -1;
  createdAt: string;
}

export interface FeedbackDeps {
  findMessage(messageId: string): Promise<{ id: string; role: string; payload: unknown; sessionId: string } | null>;
  // 내 세션만 돌려준다. (user_id 로 한정)
  findSession(userId: string, sessionId: string): Promise<{ id: string; supervisorId: string | null } | null>;
  findSupervisor(userId: string, supervisorId: string): Promise<SupervisorRow | null>;
  feedbackExists(messageId: string): Promise<boolean>;
  insertFeedback(row: {
    messageId: string;
    supervisorId: string;
    helpful: boolean;
    actualReaction: string | null;
    newNote: string | null;
    axisHint: AxisHint | null;
  }): Promise<{ id: string }>;
  updateLearnedNotes(userId: string, supervisorId: string, notes: string[]): Promise<void>;
  updateScoreAdjust(userId: string, supervisorId: string, adjust: Partial<Record<Axis, number>>): Promise<void>;
  listPendingHints(supervisorId: string): Promise<PendingHint[]>;
  markApplied(ids: string[]): Promise<void>;
  // Gemini 클라이언트. 키가 없으면 던질 수 있다. (피드백 저장은 계속한다)
  getClient(): GeminiClient;
}

export interface FeedbackResult {
  id: string;
  helpful: boolean;
  newNote: string | null;
  axisHint: AxisHint | null;
  scoreAdjusted: AxisHint | null;
}

const messageNotFound = () => new AppError(404, 'MESSAGE_NOT_FOUND', '답변 메시지를 찾을 수 없어요');
const supervisorNotFound = () => new AppError(404, 'SUPERVISOR_NOT_FOUND', '상사 정보를 찾을 수 없어요');

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// 새 메모를 붙인다. 10개를 넘으면 가장 오래된 5개를 요약해 교체하고, 요약이 실패하면 가장 오래된 것부터 버린다.
export async function mergeNotes(
  existing: string[],
  newNote: string,
  summarize: (notes: string[]) => Promise<string>,
): Promise<string[]> {
  const list = [...existing, newNote];
  if (list.length <= MAX_LEARNED_NOTES) return list;

  let merged: string[];
  try {
    const summary = await summarize(list.slice(0, NOTES_TO_SUMMARIZE));
    merged = [summary, ...list.slice(NOTES_TO_SUMMARIZE)];
  } catch {
    merged = list;
  }
  return merged.length > MAX_LEARNED_NOTES ? merged.slice(merged.length - MAX_LEARNED_NOTES) : merged;
}

// 최종 점수 = clamp(base + adjust, -100, 100) 이 되도록 보정값을 정한다. (applyAdjust 와 같은 기준)
export function nextAdjustValue(base: number, current: number, dir: 1 | -1): number {
  const target = clamp(base + current + dir * ADJUST_STEP, -100, 100);
  return target - base;
}

// 같은 축, 같은 방향으로 아직 반영되지 않은 힌트가 2개 이상이면 오래된 2개를 돌려준다.
export function pickHintsToApply(pending: PendingHint[], hint: AxisHint): PendingHint[] | null {
  const same = pending
    .filter((p) => p.axis === hint.axis && p.dir === hint.dir)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return same.length >= APPLY_THRESHOLD ? same.slice(0, APPLY_THRESHOLD) : null;
}

function safeClient(deps: FeedbackDeps): GeminiClient | null {
  try {
    return deps.getClient();
  } catch {
    return null;
  }
}

async function analyze(
  deps: FeedbackDeps,
  input: { intent: string; actualReaction: string; learnedNotes: string[] },
): Promise<FeedbackAnalysis | null> {
  const client = safeClient(deps);
  if (!client) return null;
  try {
    return await analyzeFeedback(input, client);
  } catch {
    // Gemini 실패해도 피드백은 저장한다. 오류 내용은 남기지 않는다.
    console.error('Feedback analysis failed');
    return null;
  }
}

export async function submitFeedback(
  userId: string,
  messageId: string,
  input: FeedbackInput,
  deps: FeedbackDeps,
): Promise<FeedbackResult> {
  if (!isUuid(messageId)) throw messageNotFound();

  // 내 세션의 AI 답변 카드(payload 가 있는 ai 메시지)만 허용한다.
  const message = await deps.findMessage(messageId);
  if (!message || message.role !== 'ai' || message.payload === null || message.payload === undefined) {
    throw messageNotFound();
  }
  const session = await deps.findSession(userId, message.sessionId);
  if (!session) throw messageNotFound();
  if (!session.supervisorId) throw supervisorNotFound();
  const supervisor = await deps.findSupervisor(userId, session.supervisorId);
  if (!supervisor) throw supervisorNotFound();

  if (await deps.feedbackExists(message.id)) throw new AppError(409, 'FEEDBACK_ALREADY_EXISTS', '이미 피드백을 남겼어요');

  let analysis: FeedbackAnalysis | null = null;
  if (!input.helpful && input.actualReaction) {
    const intent = String((message.payload as { intent?: unknown }).intent ?? '');
    analysis = await analyze(deps, {
      intent,
      actualReaction: input.actualReaction,
      learnedNotes: supervisor.learned_notes,
    });
  }
  const newNote = analysis?.newNote ?? null;
  const axisHint = analysis?.axisHint ?? null;

  let saved: { id: string };
  try {
    saved = await deps.insertFeedback({
      messageId: message.id,
      supervisorId: supervisor.id,
      helpful: input.helpful,
      actualReaction: input.helpful ? null : input.actualReaction,
      newNote,
      axisHint,
    });
  } catch (err) {
    if (err instanceof FeedbackExistsError) {
      throw new AppError(409, 'FEEDBACK_ALREADY_EXISTS', '이미 피드백을 남겼어요');
    }
    throw err;
  }

  if (newNote) {
    const client = safeClient(deps);
    const notes = await mergeNotes(supervisor.learned_notes, newNote, (old) => {
      if (!client) return Promise.reject(new Error('No client'));
      return summarizeNotes(old, client);
    });
    await deps.updateLearnedNotes(userId, supervisor.id, notes);
  }

  let scoreAdjusted: AxisHint | null = null;
  if (axisHint) {
    const base = supervisor.scores[axisHint.axis];
    // 측정되지 않은 축은 보정할 수 없다.
    if (base) {
      const toApply = pickHintsToApply(await deps.listPendingHints(supervisor.id), axisHint);
      if (toApply) {
        const adjust = { ...(supervisor.score_adjust ?? {}) };
        adjust[axisHint.axis] = nextAdjustValue(base.score, adjust[axisHint.axis] ?? 0, axisHint.dir);
        await deps.updateScoreAdjust(userId, supervisor.id, adjust);
        await deps.markApplied(toApply.map((p) => p.id));
        scoreAdjusted = { axis: axisHint.axis, dir: axisHint.dir };
      }
    }
  }

  return { id: saved.id, helpful: input.helpful, newNote, axisHint, scoreAdjusted };
}
