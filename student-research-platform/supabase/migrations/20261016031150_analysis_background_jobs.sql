begin;
create table public.analysis_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('processing','completed','failed')),
  result jsonb,
  error text check (length(error) <= 2000),
  created_at timestamptz not null default now(),
  check (result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=1000000))
);
create index analysis_jobs_owner_created_idx on public.analysis_jobs(user_id,created_at desc);
alter table public.analysis_jobs enable row level security;
revoke all on public.analysis_jobs from public,anon,authenticated;
grant select,insert,update on public.analysis_jobs to authenticated;
create policy analysis_jobs_select on public.analysis_jobs for select to authenticated using ((select auth.uid())=user_id);
create policy analysis_jobs_insert on public.analysis_jobs for insert to authenticated with check ((select auth.uid())=user_id);
create policy analysis_jobs_update on public.analysis_jobs for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
comment on table public.analysis_jobs is 'Owner-private background task status and final AI output only. No input document bodies, API keys, or OAuth tokens.';
commit;
