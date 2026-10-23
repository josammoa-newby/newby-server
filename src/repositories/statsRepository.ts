import { supabase } from '../lib/supabase.js';

export interface StatsRow {
  xp: number;
  level: number;
  streak: number;
  last_active_date: string | null;
}

// user_id 는 가져오지 않는다. 모든 쿼리는 user_id 로 한정한다. (service role 이라 RLS 가 막아주지 않는다)
const COLUMNS = 'xp, level, streak, last_active_date';

export async function findByUser(userId: string): Promise<StatsRow | null> {
  const { data, error } = await supabase
    .from('user_stats')
    .select(COLUMNS)
    .eq('user_id', userId)
    .maybeSingle<StatsRow>();
  if (error) throw error;
  return data;
}

export async function upsert(userId: string, stats: StatsRow): Promise<StatsRow> {
  const { data, error } = await supabase
    .from('user_stats')
    .upsert({ user_id: userId, ...stats }, { onConflict: 'user_id' })
    .select(COLUMNS)
    .single<StatsRow>();
  if (error || !data) throw error ?? new Error('Stats upsert returned no row');
  return data;
}
