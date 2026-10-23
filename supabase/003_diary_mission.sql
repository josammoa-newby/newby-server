-- Newby: 일기 / 미션 / 통계 스키마
-- Supabase SQL Editor 에서 실행합니다. (여러 번 실행해도 안전하도록 작성)

-- updated_at 자동 갱신 함수 (002_persona.sql 에도 같은 함수가 있으므로 create or replace)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 일기
create table if not exists public.diaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  content text not null,
  mood text,
  source text not null default 'manual',
  -- 채팅 메시지 id. 002_persona.sql 적용 순서에 의존하지 않도록 FK 는 걸지 않음
  message_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint diaries_source_check check (source in ('manual', 'ai_message'))
);

create index if not exists diaries_user_id_date_idx
  on public.diaries (user_id, date desc);

drop trigger if exists diaries_set_updated_at on public.diaries;
create trigger diaries_set_updated_at
  before update on public.diaries
  for each row execute function public.set_updated_at();

-- 일기 분석
create table if not exists public.diary_analyses (
  diary_id uuid primary key references public.diaries (id) on delete cascade,
  summary text,
  emotion text,
  growth_point text,
  tomorrow_tip text,
  created_at timestamptz default now()
);

-- 미션
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  title text not null,
  done boolean not null default false,
  xp int not null default 10,
  created_at timestamptz default now()
);

create index if not exists missions_user_id_date_idx
  on public.missions (user_id, date);

-- 사용자 통계
create table if not exists public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  xp int not null default 0,
  level int not null default 1,
  streak int not null default 0,
  last_active_date date
);

-- RLS: 본인 데이터만 접근 (서버는 service role 로 RLS 를 우회해 접근)
alter table public.diaries enable row level security;
alter table public.diary_analyses enable row level security;
alter table public.missions enable row level security;
alter table public.user_stats enable row level security;

drop policy if exists "diaries_own" on public.diaries;
create policy "diaries_own" on public.diaries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "diary_analyses_own" on public.diary_analyses;
create policy "diary_analyses_own" on public.diary_analyses
  for all to authenticated
  using (
    exists (
      select 1 from public.diaries d
      where d.id = diary_analyses.diary_id and d.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.diaries d
      where d.id = diary_analyses.diary_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "missions_own" on public.missions;
create policy "missions_own" on public.missions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_stats_own" on public.user_stats;
create policy "user_stats_own" on public.user_stats
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
