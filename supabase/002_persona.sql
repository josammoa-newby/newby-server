-- Newby: 상사 페르소나 / AI 세션 스키마
-- Supabase SQL Editor 에서 실행합니다. (여러 번 실행해도 안전하도록 작성)
--
-- 서버는 service role 로 접근하므로 RLS 는 이중 안전장치이며, 서버 코드에서도 user_id 로 반드시 필터할 것
-- 최종 축 점수 = clamp(scores 점수 + score_adjust, -100, 100), 재채점은 scores 만 갱신하고 score_adjust 는 유지

-- updated_at 자동 갱신 함수 (003_diary_mission.sql 에도 같은 함수가 있으므로 create or replace)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 상사 페르소나
create table if not exists public.supervisor_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  position text,
  channel text not null default 'messenger',
  mode text not null default 'quick',
  answers jsonb not null,
  scores jsonb not null,
  score_adjust jsonb not null default '{}',
  code text,
  catchphrases text[] not null default '{}',
  anger_signals text,
  happy_signals text,
  dislikes text,
  values_text text,
  examples jsonb not null default '[]',
  learned_notes text[] not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supervisor_profile_nickname_check
    check (char_length(nickname) between 1 and 20),
  constraint supervisor_profile_channel_check
    check (channel in ('messenger', 'face', 'email')),
  constraint supervisor_profile_mode_check
    check (mode in ('quick', 'full'))
);

create index if not exists supervisor_profile_user_id_idx
  on public.supervisor_profile (user_id);

-- 사용자당 기본 상사는 1명만
create unique index if not exists supervisor_profile_default_key
  on public.supervisor_profile (user_id) where is_default;

drop trigger if exists supervisor_profile_set_updated_at on public.supervisor_profile;
create trigger supervisor_profile_set_updated_at
  before update on public.supervisor_profile
  for each row execute function public.set_updated_at();

-- AI 세션
create table if not exists public.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  supervisor_id uuid references public.supervisor_profile (id) on delete set null,
  title text,
  created_at timestamptz default now()
);

create index if not exists ai_sessions_user_id_created_at_idx
  on public.ai_sessions (user_id, created_at desc);

-- AI 메시지
create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_sessions (id) on delete cascade,
  role text not null,
  text text,
  payload jsonb,
  created_at timestamptz default now(),
  constraint ai_messages_role_check check (role in ('user', 'ai'))
);

create index if not exists ai_messages_session_id_created_at_idx
  on public.ai_messages (session_id, created_at);

-- 페르소나 피드백
create table if not exists public.persona_feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.ai_messages (id) on delete cascade,
  supervisor_id uuid not null references public.supervisor_profile (id) on delete cascade,
  helpful boolean not null,
  actual_reaction text,
  new_note text,
  axis_hint jsonb,
  applied boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists persona_feedback_supervisor_id_applied_idx
  on public.persona_feedback (supervisor_id, applied);

-- RLS: 본인 데이터만 접근
alter table public.supervisor_profile enable row level security;
alter table public.ai_sessions enable row level security;
alter table public.ai_messages enable row level security;
alter table public.persona_feedback enable row level security;

drop policy if exists "supervisor_profile_own" on public.supervisor_profile;
create policy "supervisor_profile_own" on public.supervisor_profile
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_sessions_own" on public.ai_sessions;
create policy "ai_sessions_own" on public.ai_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_messages_own" on public.ai_messages;
create policy "ai_messages_own" on public.ai_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.ai_sessions s
      where s.id = ai_messages.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_sessions s
      where s.id = ai_messages.session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "persona_feedback_own" on public.persona_feedback;
create policy "persona_feedback_own" on public.persona_feedback
  for all to authenticated
  using (
    exists (
      select 1 from public.supervisor_profile p
      where p.id = persona_feedback.supervisor_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.supervisor_profile p
      where p.id = persona_feedback.supervisor_id and p.user_id = auth.uid()
    )
  );
