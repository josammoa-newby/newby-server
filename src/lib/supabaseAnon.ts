import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

// 사용자 로그인(signInWithPassword) 전용. service role 클라이언트와 분리해서 쓴다.
export const supabaseAnon = createClient(
  config.supabaseUrl,
  config.supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
