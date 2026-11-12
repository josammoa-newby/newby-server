import { supabase } from '../lib/supabase.js';
import { compareMissionRows } from '../services/missionDefaults.js';
import type { MissionDifficulty, MissionSource } from '../services/missionValidation.js';

export interface MissionRow {
  id: string;
  date: string;
  title: string;
  done: boolean;
  xp: number;
  // 자동 생성 미션의 순서(1~3). 직접 만든 미션은 null
  slot: number | null;
  source: MissionSource;
  reason: string | null;
  difficulty: MissionDifficulty | null;
  created_at: string;
}

// user_id 는 가져오지 않는다. 모든 쿼리는 user_id 로 한정한다. (service role 이라 RLS 가 막아주지 않는다)
const COLUMNS = 'id, date, title, done, xp, slot, source, reason, difficulty, created_at';

export interface NewMission {
  date: string;
  title: string;
  xp: number;
  // 자동 생성 미션만: 순서(1~3), 출처, 이유, 난이도. 직접 만든 미션은 생략한다. (source 는 'manual')
  slot?: number;
  source?: MissionSource;
  reason?: string | null;
  difficulty?: MissionDifficulty;
}

function toInsertRow(userId: string, m: NewMission) {
  return {
    user_id: userId,
    date: m.date,
    title: m.title,
    xp: m.xp,
    slot: m.slot ?? null,
    source: m.source ?? 'manual',
    reason: m.reason ?? null,
    difficulty: m.difficulty ?? null,
  };
}

export async function listByDate(userId: string, date: string): Promise<MissionRow[]> {
  const { data, error } = await supabase
    .from('missions')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('date', date)
    // 자동 생성 미션은 slot 순, 직접 만든 미션은 그 뒤에 만든 순. 시각이 같아도 id 로 순서를 고정한다.
    .order('slot', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .returns<MissionRow[]>();
  if (error) throw error;
  // DB 정렬 규칙(null 위치 등)에 기대지 않도록 같은 기준으로 한 번 더 고정한다.
  return (data ?? []).sort(compareMissionRows);
}

export async function insertMany(userId: string, missions: NewMission[]): Promise<MissionRow[]> {
  if (missions.length === 0) return [];
  const { data, error } = await supabase
    .from('missions')
    .insert(missions.map((m) => toInsertRow(userId, m)))
    .select(COLUMNS)
    .returns<MissionRow[]>();
  if (error) throw error;
  return data ?? [];
}

// 자동 생성 미션을 insert 한 문장으로 넣는다. 전부 들어가거나 전부 실패한다.
// (user_id, date, slot) 유니크에 걸리면 이미 다른 요청이 만든 것이라 null 을 돌려준다.
export async function insertGenerated(userId: string, missions: NewMission[]): Promise<MissionRow[] | null> {
  const { data, error } = await supabase
    .from('missions')
    .insert(missions.map((m) => toInsertRow(userId, m)))
    .select(COLUMNS)
    .returns<MissionRow[]>();
  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }
  return data ?? [];
}

export async function findOwned(userId: string, id: string): Promise<MissionRow | null> {
  const { data, error } = await supabase
    .from('missions')
    .select(COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<MissionRow>();
  if (error) throw error;
  return data;
}

// done 값이 실제로 바뀐 경우에만 행을 돌려준다. (이미 같은 값이거나 내 미션이 아니면 null)
export async function setDoneIfChanged(userId: string, id: string, done: boolean): Promise<MissionRow | null> {
  const { data, error } = await supabase
    .from('missions')
    .update({ done })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('done', !done)
    .select(COLUMNS)
    .maybeSingle<MissionRow>();
  if (error) throw error;
  return data;
}

export async function deleteOwned(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('missions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
