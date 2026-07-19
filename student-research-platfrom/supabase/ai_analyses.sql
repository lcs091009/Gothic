-- ============================================================
-- 학생별 AI 분석 결과 저장 + 접근 제어 (Row Level Security)
-- Supabase 대시보드 > SQL Editor 에서 그대로 실행하세요.
--
-- 핵심: 학생은 "자기 결과만" 조회 가능, 선생님은 폴더 업로드 후
--       학생별 분석 결과를 생성/조회할 수 있습니다.
-- ============================================================

-- 1) 선생님 여부 확인 함수
--    profiles 정책이 profiles 자신을 참조하면 무한 재귀가 나므로,
--    security definer 함수로 감싸서 재귀를 피합니다.
create or replace function public.is_teacher()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

-- 2) AI 분석 결과 테이블
create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid references auth.users (id) on delete cascade,
  student_number text,
  student_email text,
  topic text,
  source_file_id text,
  source_file_name text,
  source_file_url text,
  analysis_text text,
  status text default 'matched',
  uploaded_by uuid references auth.users (id),
  created_at timestamptz default now()
);

create index if not exists ai_analyses_student_idx
  on public.ai_analyses (student_user_id);

alter table public.ai_analyses enable row level security;

-- 3) 학생은 자기 결과만 조회
drop policy if exists "students read own analyses" on public.ai_analyses;
create policy "students read own analyses"
  on public.ai_analyses for select
  using (auth.uid() = student_user_id);

-- 4) 선생님은 모든 결과 조회
drop policy if exists "teachers read all analyses" on public.ai_analyses;
create policy "teachers read all analyses"
  on public.ai_analyses for select
  using (public.is_teacher());

-- 5) 선생님만 결과 생성 (다른 학생의 결과도 생성 가능)
drop policy if exists "teachers insert analyses" on public.ai_analyses;
create policy "teachers insert analyses"
  on public.ai_analyses for insert
  with check (public.is_teacher());

-- 6) 선생님만 결과 삭제
drop policy if exists "teachers delete analyses" on public.ai_analyses;
create policy "teachers delete analyses"
  on public.ai_analyses for delete
  using (public.is_teacher());

-- 7) 선생님이 학생 목록을 조회할 수 있도록 profiles 정책 추가
--    (파일명 학번 <-> 학생 매칭에 필요. 기존 "본인 프로필 조회" 정책은 그대로 둡니다)
drop policy if exists "teachers read all profiles" on public.profiles;
create policy "teachers read all profiles"
  on public.profiles for select
  using (public.is_teacher());

-- ============================================================
-- 선생님 계정 지정
--   대상 계정이 한 번 로그인해서 profiles 행이 생긴 뒤에 실행하세요.
--   (다른 계정을 쓰려면 아래 이메일만 바꾸면 됩니다)
-- ============================================================
update public.profiles set role = 'teacher'
where email = 'snpark200471@gmail.com';
