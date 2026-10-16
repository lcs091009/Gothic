-- Restrictive policies also constrain pre-existing permissive owner policies.
create policy teacher_assignment_insert_guard on public.teacher_shared_files
as restrictive for insert to authenticated
with check (teacher_id = (select auth.uid()) and (select public.is_approved_teacher()));
create policy teacher_assignment_update_guard on public.teacher_shared_files
as restrictive for update to authenticated
using (teacher_id = (select auth.uid()) and (select public.is_approved_teacher()))
with check (teacher_id = (select auth.uid()) and (select public.is_approved_teacher()));
