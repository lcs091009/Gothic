begin;
-- School student numbers use GCCNN (e.g. 10315 = grade 1, class 03, number 15).
-- Unknown formats remain null and are visible in the unfiltered directory.
alter table public.profiles
  add column if not exists directory_grade integer generated always as
    (case when student_number ~ '^[1-3][0-9]{4}$' then case when substring(student_number,2,2)::integer > 0 and right(student_number,2)::integer > 0 then left(student_number,1)::integer end end) stored,
  add column if not exists directory_class integer generated always as
    (case when student_number ~ '^[1-3][0-9]{4}$' then case when substring(student_number,2,2)::integer > 0 and right(student_number,2)::integer > 0 then substring(student_number,2,2)::integer end end) stored,
  add column if not exists directory_number integer generated always as
    (case when student_number ~ '^[1-3][0-9]{4}$' then case when substring(student_number,2,2)::integer > 0 and right(student_number,2)::integer > 0 then right(student_number,2)::integer end end) stored;
create index if not exists profiles_student_directory_grade_idx on public.profiles(directory_grade,directory_class,directory_number,id) where role='student';
create index if not exists profiles_student_directory_class_idx on public.profiles(directory_class,directory_number,id) where role='student';
create index if not exists profiles_student_directory_number_idx on public.profiles(directory_number,id) where role='student';
-- Read-only access for approved teachers. Student ownership and all write policies stay intact.
drop policy if exists profiles_teacher_read_students on public.profiles;
create policy profiles_teacher_read_students on public.profiles for select to authenticated
using (role='student' and (select public.is_approved_teacher()));
drop policy if exists academic_teacher_read on public.student_academic_profiles;
create policy academic_teacher_read on public.student_academic_profiles for select to authenticated
using ((select public.is_approved_teacher()) and exists(select 1 from public.profiles where id=user_id and role='student'));
drop policy if exists records_teacher_read on public.research_records;
create policy records_teacher_read on public.research_records for select to authenticated
using ((select public.is_approved_teacher()) and exists(select 1 from public.profiles where id=user_id and role='student'));
commit;
