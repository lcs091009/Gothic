alter table public.student_academic_profiles
  add column if not exists academic_year integer,
  add column if not exists curriculum_version text,
  add column if not exists subject_name text,
  add column if not exists subject_category text,
  add column if not exists is_custom_subject boolean not null default false,
  add column if not exists custom_subject_name text,
  add column if not exists selected_units jsonb not null default '[]'::jsonb,
  add column if not exists curriculum_confirmed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.student_academic_profiles
  drop constraint if exists student_academic_profiles_curriculum_version_check;

alter table public.student_academic_profiles
  add constraint student_academic_profiles_curriculum_version_check
  check (
    curriculum_version is null
    or curriculum_version in ('2015', '2022', 'custom')
  );