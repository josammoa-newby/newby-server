-- Newby: profiles 스키마
-- Supabase SQL Editor 에서 실행합니다. (여러 번 실행해도 안전하도록 작성)

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  name text not null,
  email text not null,
  job text,
  work_style text,
  boss_style text,
  marketing_agreed boolean not null default false,
  created_at timestamptz not null default now(),
  -- 아이디는 항상 소문자로 저장
  constraint profiles_username_lowercase check (username = lower(username))
);

-- 아이디 대소문자 무시 유니크
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

-- 본인 행만 조회/수정 가능 (서버는 service role 로 RLS 를 우회해 접근)
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
