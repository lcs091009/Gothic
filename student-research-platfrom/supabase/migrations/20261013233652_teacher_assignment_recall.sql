-- Add only the missing owner/approved-teacher DELETE policy. Existing SELECT
-- and recipient visibility policies are preserved; student rows stay protected.
drop policy if exists teacher_recall_own_assignments on public.teacher_shared_files;
create policy teacher_recall_own_assignments on public.teacher_shared_files
for delete to authenticated
using (teacher_id = (select auth.uid()) and (select public.is_approved_teacher()));
