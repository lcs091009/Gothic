create table if not exists public.ai_global_analysis_quota (
 slot boolean primary key default true check(slot), window_start timestamptz not null, request_count integer not null default 0
);
alter table public.ai_global_analysis_quota enable row level security;
revoke all on public.ai_global_analysis_quota from public, anon, authenticated;
create or replace function public.consume_ai_analysis_quota()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); stamp timestamptz:=now(); quota public.ai_global_analysis_quota%rowtype;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='student') then raise exception 'Approved student required'; end if;
 insert into public.ai_global_analysis_quota(slot,window_start) values(true,stamp) on conflict do nothing;
 select * into quota from public.ai_global_analysis_quota where slot=true for update;
 if stamp>=quota.window_start+interval '10 minutes' then quota.window_start:=stamp;quota.request_count:=0;end if;
 if quota.request_count>=200 then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from quota.window_start+interval '10 minutes'-stamp))::integer));end if;
 update public.ai_global_analysis_quota set window_start=quota.window_start,request_count=quota.request_count+1 where slot=true;
 return jsonb_build_object('allowed',true);
end;$$;
revoke all on function public.consume_ai_analysis_quota() from public,anon;
grant execute on function public.consume_ai_analysis_quota() to authenticated;
-- Preserve old rows and recipient/teacher RLS; remove the file-count restriction.
alter table public.teacher_shared_files drop constraint if exists teacher_assignment_attachments_limit;
alter table public.teacher_shared_files add constraint teacher_assignment_attachments_limit check(jsonb_typeof(attachments)='array');
