import { supabase } from '../lib/supabase.js';
import { FeedbackExistsError } from '../services/feedbackFlow.js';
import type { PendingHint } from '../services/feedbackFlow.js';
import type { Adjustment } from '../services/supervisorMapper.js';
import type { Axis } from '../persona/types.js';

const AXES: readonly string[] = ['directness', 'control', 'reporting', 'warmth', 'speed', 'stability'];

function toHint(value: unknown): { axis: Axis; dir: 1 | -1 } | null {
  if (typeof value !== 'object' || value === null) return null;
  const h = value as { axis?: unknown; dir?: unknown };
  if (typeof h.axis === 'string' && AXES.includes(h.axis) && (h.dir === 1 || h.dir === -1)) {
    return { axis: h.axis as Axis, dir: h.dir };
  }
  return null;
}

// ai_messages 에는 user_id 가 없다. 소유 확인은 세션(findOwnedSession)으로 한다.
export async function findMessage(
  messageId: string,
): Promise<{ id: string; role: string; payload: unknown; sessionId: string } | null> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('id, role, payload, session_id')
    .eq('id', messageId)
    .maybeSingle<{ id: string; role: string; payload: unknown; session_id: string }>();
  if (error) throw error;
  return data ? { id: data.id, role: data.role, payload: data.payload, sessionId: data.session_id } : null;
}

export async function feedbackExists(messageId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('persona_feedback')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  return data !== null;
}

export async function insertFeedback(row: {
  messageId: string;
  supervisorId: string;
  helpful: boolean;
  actualReaction: string | null;
  newNote: string | null;
  axisHint: { axis: Axis; dir: 1 | -1 } | null;
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('persona_feedback')
    .insert({
      message_id: row.messageId,
      supervisor_id: row.supervisorId,
      helpful: row.helpful,
      actual_reaction: row.actualReaction,
      new_note: row.newNote,
      axis_hint: row.axisHint,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) {
    // message_id 가 unique 라서 동시에 두 번 보내면 여기서 걸린다.
    if (error.code === '23505') throw new FeedbackExistsError();
    throw error;
  }
  return data;
}

// user_id 로 한정해서 내 상사만 수정한다. (service role 이라 RLS 가 막아주지 않는다)
export async function updateLearnedNotes(userId: string, supervisorId: string, notes: string[]): Promise<void> {
  const { error } = await supabase
    .from('supervisor_profile')
    .update({ learned_notes: notes })
    .eq('id', supervisorId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function updateScoreAdjust(
  userId: string,
  supervisorId: string,
  adjust: Partial<Record<Axis, number>>,
): Promise<void> {
  const { error } = await supabase
    .from('supervisor_profile')
    .update({ score_adjust: adjust })
    .eq('id', supervisorId)
    .eq('user_id', userId);
  if (error) throw error;
}

// 아직 반영되지 않은 axis_hint 목록 (오래된 순)
export async function listPendingHints(supervisorId: string): Promise<PendingHint[]> {
  const { data, error } = await supabase
    .from('persona_feedback')
    .select('id, axis_hint, created_at')
    .eq('supervisor_id', supervisorId)
    .eq('applied', false)
    .not('axis_hint', 'is', null)
    .order('created_at', { ascending: true })
    .returns<{ id: string; axis_hint: unknown; created_at: string }[]>();
  if (error) throw error;
  const hints: PendingHint[] = [];
  for (const row of data ?? []) {
    const hint = toHint(row.axis_hint);
    if (hint) hints.push({ id: row.id, ...hint, createdAt: row.created_at });
  }
  return hints;
}

export async function markApplied(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('persona_feedback').update({ applied: true }).in('id', ids);
  if (error) throw error;
}

// 상사 상세의 recentAdjustments: applied=true 인 피드백 중 최근 limit 개
export async function listRecentApplied(supervisorId: string, limit = 3): Promise<Adjustment[]> {
  const { data, error } = await supabase
    .from('persona_feedback')
    .select('axis_hint, created_at')
    .eq('supervisor_id', supervisorId)
    .eq('applied', true)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<{ axis_hint: unknown; created_at: string }[]>();
  if (error) throw error;
  const result: Adjustment[] = [];
  for (const row of data ?? []) {
    const hint = toHint(row.axis_hint);
    if (hint) result.push({ ...hint, createdAt: row.created_at });
  }
  return result;
}
