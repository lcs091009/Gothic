-- ============================================================
-- 학생의 교육과정 설정 저장 (1~3단계: 판별/과목/단원 선택)
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.
-- 학생 본인만 자기 설정을 읽고 씁니다.
-- ============================================================

create table if not exists public.student_curriculum (
  user_id uuid primary key references auth.users (id) on delete cascade,
  academic_year int,
  grade int,
  curriculum_version text,
  version_overridden boolean default false,
  selection jsonb default '{}'::jsonb,   -- { subject:{abbr,name}, units:[{code,area,status}] }
  updated_at timestamptz default now()
);

alter table public.student_curriculum enable row level security;

drop policy if exists "own read curriculum" on public.student_curriculum;
create policy "own read curriculum"
  on public.student_curriculum for select
  using (auth.uid() = user_id);

drop policy if exists "own insert curriculum" on public.student_curriculum;
create policy "own insert curriculum"
  on public.student_curriculum for insert
  with check (auth.uid() = user_id);

drop policy if exists "own update curriculum" on public.student_curriculum;
create policy "own update curriculum"
  on public.student_curriculum for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
