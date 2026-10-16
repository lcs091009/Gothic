grant delete on public.analysis_notes to authenticated;
create policy analysis_notes_delete on public.analysis_notes
for delete to authenticated using ((select auth.uid()) = user_id);
