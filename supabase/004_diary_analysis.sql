-- Newby: 일기 AI 분석 컬럼
-- Supabase SQL Editor 에서 실행합니다. (여러 번 실행해도 안전하도록 작성)
--
-- analysis    : AI 분석 결과(jsonb 객체). 일기 content/mood 가 수정되면 서버가 null 로 되돌린다.
-- analyzed_at : 분석을 저장한 시각. API 의 analysis.generatedAt 으로 내려간다.
-- 기존 diary_analyses 테이블(003)은 쓰지 않고 그대로 둔다. 컬럼은 diaries 의 기존 RLS 정책(diaries_own)이 그대로 적용된다.
-- 분석을 저장하면 diaries 의 updated_at 트리거가 돌아 updated_at 도 갱신된다.

alter table public.diaries
  add column if not exists analysis jsonb,
  add column if not exists analyzed_at timestamptz;

alter table public.diaries drop constraint if exists diaries_analysis_object_check;
alter table public.diaries
  add constraint diaries_analysis_object_check
  check (analysis is null or jsonb_typeof(analysis) = 'object');
