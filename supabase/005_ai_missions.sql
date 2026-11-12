-- Newby: AI 미션 생성 (슬롯 / 출처 / 이유 / 난이도)
-- Supabase SQL Editor 에서 실행합니다. (여러 번 실행해도 안전하도록 작성)
--
-- slot       : 자동 생성 미션(ai/default)의 순서 1~3. 직접 만든 미션(manual)은 null.
--              (user_id, date, slot) 유니크로 하루 자동 생성 미션이 3개를 넘지 않게 하고, 정렬을 고정한다.
-- source     : 'ai' | 'default' | 'manual'. 기존 행은 'manual' 로 본다.
-- reason     : 왜 이 미션인지 (AI 미션만)
-- difficulty : 'easy' | 'medium' | 'hard' (자동 생성 미션만)

alter table public.missions
  add column if not exists slot smallint,
  add column if not exists source text not null default 'manual',
  add column if not exists reason text,
  add column if not exists difficulty text;

alter table public.missions drop constraint if exists missions_slot_check;
alter table public.missions
  add constraint missions_slot_check check (slot is null or slot between 1 and 3);

alter table public.missions drop constraint if exists missions_source_check;
alter table public.missions
  add constraint missions_source_check check (source in ('ai', 'default', 'manual'));

alter table public.missions drop constraint if exists missions_difficulty_check;
alter table public.missions
  add constraint missions_difficulty_check check (difficulty is null or difficulty in ('easy', 'medium', 'hard'));

create unique index if not exists missions_user_date_slot_uniq
  on public.missions (user_id, date, slot)
  where slot is not null;
