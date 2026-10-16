begin;
create table public.analysis_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 160),
  content jsonb not null check (jsonb_typeof(content) = 'object' and content->>'version' = '1' and octet_length(content::text) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index analysis_notes_owner_updated_idx on public.analysis_notes(user_id, updated_at desc);
alter table public.analysis_notes enable row level security;
revoke all on public.analysis_notes from public, anon, authenticated;
grant select, insert, update on public.analysis_notes to authenticated;
create policy analysis_notes_select on public.analysis_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy analysis_notes_insert on public.analysis_notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy analysis_notes_update on public.analysis_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
comment on table public.analysis_notes is 'Private saved AI analysis and exploration cards. Attachment body text and OAuth tokens are not stored by the application.';
commit;
