import { supabase } from '../lib/supabase.js';

export interface SessionRow {
  id: string;
  supervisor_id: string | null;
  title: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  role: 'user' | 'ai';
  text: string | null;
  payload: unknown;
  created_at: string;
}

// user_id 는 가져오지 않는다. 세션은 항상 user_id 로 한정해서 조회한다. (service role 이라 RLS 가 막아주지 않는다)
const SESSION_COLUMNS = 'id, supervisor_id, title, created_at';
const MESSAGE_COLUMNS = 'id, role, text, payload, created_at';

export async function insertSession(userId: string, supervisorId: string, title: string): Promise<SessionRow> {
  const { data, error } = await supabase
    .from('ai_sessions')
    .insert({ user_id: userId, supervisor_id: supervisorId, title })
    .select(SESSION_COLUMNS)
    .single<SessionRow>();
  if (error || !data) throw error ?? new Error('Session insert returned no row');
  return data;
}

export async function findOwnedSession(userId: string, id: string): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from('ai_sessions')
    .select(SESSION_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle<SessionRow>();
  if (error) throw error;
  return data;
}

// 세션 소유 확인은 호출 전에 findOwnedSession 으로 끝낸 상태여야 한다. (ai_messages 에는 user_id 가 없다)
export async function insertMessage(
  sessionId: string,
  role: 'user' | 'ai',
  text: string,
  payload: unknown,
): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('ai_messages')
    .insert({ session_id: sessionId, role, text, payload })
    .select(MESSAGE_COLUMNS)
    .single<MessageRow>();
  if (error || !data) throw error ?? new Error('Message insert returned no row');
  return data;
}

export async function listMessages(sessionId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select(MESSAGE_COLUMNS)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .returns<MessageRow[]>();
  if (error) throw error;
  return data ?? [];
}

// 최근 limit 개를 시간순으로 돌려준다.
export async function listRecentMessages(sessionId: string, limit: number): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select(MESSAGE_COLUMNS)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<MessageRow[]>();
  if (error) throw error;
  return (data ?? []).reverse();
}
