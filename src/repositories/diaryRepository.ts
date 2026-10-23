import { supabase } from '../lib/supabase.js';

export interface DiaryRow {
  id: string;
  date: string;
  content: string;
  mood: string | null;
  source: 'manual' | 'ai_message';
  message_id: string | null;
  created_at: string;
  updated_at: string;
}

// user_id 는 가져오지 않는다. 모든 쿼리는 user_id 로 한정한다. (service role 이라 RLS 가 막아주지 않는다)
const COLUMNS = 'id, date, content, mood, source, message_id, created_at, updated_at';

export interface NewDiary {
  userId: string;
  date: string;
  content: string;
  mood: string | null;
  source: 'manual' | 'ai_message';
  messageId: string | null;
}

export type DiaryColumns = Partial<{ date: string; content: string; mood: string | null }>;

export async function insert(diary: NewDiary): Promise<DiaryRow> {
  const { data, error } = await supabase
    .from('diaries')
    .insert({
      user_id: diary.userId,
      date: diary.date,
      content: diary.content,
      mood: diary.mood,
      source: diary.source,
      message_id: diary.messageId,
    })
    .select(COLUMNS)
    .single<DiaryRow>();
  if (error || !data) throw error ?? new Error('Diary insert returned no row');
  return data;
}

export async function listOwned(
  userId: string,
  opts: { from?: string; to?: string; limit: number },
): Promise<DiaryRow[]> {
  let query = supabase
    .from('diaries')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts.limit);
  if (opts.from) query = query.gte('date', opts.from);
  if (opts.to) query = query.lte('date', opts.to);
  const { data, error } = await query.returns<DiaryRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function findOwned(userId: string, id: string): Promise<DiaryRow | null> {
  const { data, error } = await supabase
    .from('diaries')
    .select(COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<DiaryRow>();
  if (error) throw error;
  return data;
}

// updated_at 은 DB 트리거가 갱신한다. 내 일기가 아니면 null.
export async function updateOwned(userId: string, id: string, columns: DiaryColumns): Promise<DiaryRow | null> {
  const { data, error } = await supabase
    .from('diaries')
    .update(columns)
    .eq('id', id)
    .eq('user_id', userId)
    .select(COLUMNS)
    .maybeSingle<DiaryRow>();
  if (error) throw error;
  return data;
}

// 삭제된 행이 없으면 false (내 일기가 아니거나 없음)
export async function deleteOwned(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('diaries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
