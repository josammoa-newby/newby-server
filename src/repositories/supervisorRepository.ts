import { supabase } from '../lib/supabase.js';
import type { SupervisorRow, SupervisorSummaryRow } from '../services/supervisorMapper.js';

// user_id 는 가져오지 않는다. 모든 쿼리는 user_id 로 한정한다. (service role 이라 RLS 가 막아주지 않는다)
const COLUMNS =
  'id, nickname, position, channel, mode, answers, scores, score_adjust, code, catchphrases, anger_signals, happy_signals, dislikes, values_text, examples, learned_notes, is_default, created_at, updated_at';
const SUMMARY_COLUMNS = 'id, nickname, position, channel, scores, score_adjust, is_default, created_at';

export interface NewSupervisor {
  userId: string;
  nickname: string;
  position: string | null;
  channel: string;
  mode: string;
  answers: unknown;
  scores: unknown;
  code: string;
  catchphrases: string[];
  angerSignals: string | null;
  happySignals: string | null;
  dislikes: string | null;
  valuesText: string | null;
  examples: unknown[];
}

// DB 컬럼명(snake_case) 그대로 받는 부분 수정 값
export type SupervisorColumns = Partial<{
  nickname: string;
  position: string | null;
  channel: string;
  mode: string;
  answers: unknown;
  scores: unknown;
  code: string;
  catchphrases: string[];
  anger_signals: string | null;
  happy_signals: string | null;
  dislikes: string | null;
  values_text: string | null;
  examples: unknown[];
}>;

async function hasAny(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('supervisor_profile')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function insertRow(supervisor: NewSupervisor, isDefault: boolean) {
  return supabase
    .from('supervisor_profile')
    .insert({
      user_id: supervisor.userId,
      nickname: supervisor.nickname,
      position: supervisor.position,
      channel: supervisor.channel,
      mode: supervisor.mode,
      answers: supervisor.answers,
      scores: supervisor.scores,
      code: supervisor.code,
      catchphrases: supervisor.catchphrases,
      anger_signals: supervisor.angerSignals,
      happy_signals: supervisor.happySignals,
      dislikes: supervisor.dislikes,
      values_text: supervisor.valuesText,
      examples: supervisor.examples,
      is_default: isDefault,
    })
    .select(COLUMNS)
    .single<SupervisorRow>();
}

// 사용자의 첫 상사면 기본 상사(is_default)로 저장한다.
export async function insert(supervisor: NewSupervisor): Promise<SupervisorRow> {
  const isFirst = !(await hasAny(supervisor.userId));
  let { data, error } = await insertRow(supervisor, isFirst);
  // 동시에 두 번째 요청이 먼저 기본 상사로 저장됐다면(부분 유니크 인덱스) 기본이 아닌 상사로 다시 저장한다.
  if (error?.code === '23505' && isFirst) {
    ({ data, error } = await insertRow(supervisor, false));
  }
  if (error || !data) throw error ?? new Error('Supervisor insert returned no row');
  return data;
}

export async function findOwned(userId: string, id: string): Promise<SupervisorRow | null> {
  const { data, error } = await supabase
    .from('supervisor_profile')
    .select(COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<SupervisorRow>();
  if (error) throw error;
  return data;
}

export async function listOwned(userId: string): Promise<SupervisorSummaryRow[]> {
  const { data, error } = await supabase
    .from('supervisor_profile')
    .select(SUMMARY_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<SupervisorSummaryRow[]>();
  if (error) throw error;
  return data ?? [];
}

// updated_at 은 DB 트리거가 갱신한다. 내 상사가 아니면 null.
export async function updateOwned(
  userId: string,
  id: string,
  columns: SupervisorColumns,
): Promise<SupervisorRow | null> {
  const { data, error } = await supabase
    .from('supervisor_profile')
    .update(columns)
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLUMNS)
    .maybeSingle<SupervisorRow>();
  if (error) throw error;
  return data;
}
