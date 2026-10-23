import { supabase } from '../lib/supabase.js';

export interface Profile {
  id: string;
  username: string;
  name: string;
  email: string;
  job: string | null;
  workStyle: string | null;
  bossStyle: string | null;
  marketingAgreed: boolean;
  createdAt: string;
}

export interface NewProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  job: string | null;
  workStyle: string | null;
  bossStyle: string | null;
  marketingAgreed: boolean;
}

export class UniqueViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UniqueViolationError';
  }
}

interface ProfileRow {
  id: string;
  username: string;
  name: string;
  email: string;
  job: string | null;
  work_style: string | null;
  boss_style: string | null;
  marketing_agreed: boolean;
  created_at: string;
}

const COLUMNS =
  'id, username, name, email, job, work_style, boss_style, marketing_agreed, created_at';

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    job: row.job,
    workStyle: row.work_style,
    bossStyle: row.boss_style,
    marketingAgreed: row.marketing_agreed,
    createdAt: row.created_at,
  };
}

export async function findByUsername(username: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(COLUMNS)
    .eq('username', username.toLowerCase())
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

export async function findById(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

export async function insert(profile: NewProfile): Promise<void> {
  const { error } = await supabase.from('profiles').insert({
    id: profile.id,
    username: profile.username,
    name: profile.name,
    email: profile.email,
    job: profile.job,
    work_style: profile.workStyle,
    boss_style: profile.bossStyle,
    marketing_agreed: profile.marketingAgreed,
  });
  if (error) {
    if (error.code === '23505') throw new UniqueViolationError(error.message);
    throw error;
  }
}

export interface ProfileUpdate {
  name?: string;
  job?: string | null;
  workStyle?: string | null;
  bossStyle?: string | null;
  marketingAgreed?: boolean;
}

// 프로필이 없으면 null. 항상 id 로 한정해서 수정한다.
export async function updateById(id: string, update: ProfileUpdate): Promise<Profile | null> {
  const row: Record<string, unknown> = {};
  if (update.name !== undefined) row.name = update.name;
  if (update.job !== undefined) row.job = update.job;
  if (update.workStyle !== undefined) row.work_style = update.workStyle;
  if (update.bossStyle !== undefined) row.boss_style = update.bossStyle;
  if (update.marketingAgreed !== undefined) row.marketing_agreed = update.marketingAgreed;

  const { data, error } = await supabase
    .from('profiles')
    .update(row)
    .eq('id', id)
    .select(COLUMNS)
    .maybeSingle<ProfileRow>();
  if (error) throw error;
  return data ? toProfile(data) : null;
}
