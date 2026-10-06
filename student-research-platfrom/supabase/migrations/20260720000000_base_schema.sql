-- Baseline for a new database. Existing tables/data are preserved by IF NOT EXISTS.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'pending' check (role in ('student', 'teacher', 'pending')),
  student_number text,
  created_at timestamptz not null default now()
);
create table if not exists public.research_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_email text,
  grade text,
  semester text,
  subject text not null,
  title text not null,
  content text not null,
  drive_file_id text,
  drive_file_name text,
  drive_file_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.student_academic_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  student_email text,
  grade text,
  current_grade text,
  admission_year integer,
  curriculum_label text,
  selected_choices jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.teacher_shared_files (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  teacher_email text,
  student_number text,
  student_email text,
  file_name text not null,
  file_url text,
  file_id text,
  match_status text not null default 'needs_review',
  category text,
  description text,
  created_at timestamptz not null default now()
);
