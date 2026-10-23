import { supabase } from '../lib/supabase.js';

export interface MissionRow {
  id: string;
  date: string;
  title: string;
  done: boolean;
  xp: number;
  created_at: string;
}

// user_id 는 가져오지 않는다. 모든 쿼리는 user_id 로 한정한다. (service role 이라 RLS 가 막아주지 않는다)
const COLUMNS = 'id, date, title, done, xp, created_at';

export interface NewMission {
  date: string;
  title: string;
  xp: number;
}

export async function listByDate(userId: string, date: string): Promise<MissionRow[]> {
  const { data, error } = await supabase
    .from('missions')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at', { ascending: true })
    .returns<MissionRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function insertMany(userId: string, missions: NewMission[]): Promise<MissionRow[]> {
  if (missions.length === 0) return [];
  const { data, error } = await supabase
    .from('missions')
    .insert(missions.map((m) => ({ user_id: userId, date: m.date, title: m.title, xp: m.xp })))
    .select(COLUMNS)
    .returns<MissionRow[]>();
  if (error) throw error;
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
