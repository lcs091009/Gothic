begin;
-- Settings are editable only by the database administrator, never by browser clients.
create table if not exists public.school_settings (
  id boolean primary key default true check (id),
  email_domain text not null
);
insert into public.school_settings(id, email_domain) values(true, 'gochon.hs.kr') on conflict do nothing;
alter table public.school_settings enable row level security;
revoke all on public.school_settings from anon, authenticated;

-- Prevent client-side role escalation and identity edits. Teachers must be approved in SQL.
create or replace function public.protect_profile_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare verified_email text; confirmed_at timestamptz; domain text;
begin
  if auth.role() = 'authenticated' then
    if new.id is distinct from auth.uid() then raise exception 'Cannot edit another profile'; end if;
    if tg_op = 'UPDATE' then
      if new.id is distinct from old.id or new.role is distinct from old.role
        or new.email is distinct from old.email or new.student_number is distinct from old.student_number then
        raise exception 'Profile identity and role are administrator-managed';
      end if;
    else
      select lower(email), email_confirmed_at into verified_email, confirmed_at from auth.users where id = auth.uid();
      select email_domain into domain from public.school_settings where id = true;
      new.email := verified_email;
      new.role := 'pending';
      new.student_number := null;
      if confirmed_at is not null and split_part(verified_email, '@', 2) = domain
        and split_part(verified_email, '@', 1) ~ '^\d{2}-\d{3,5}$' then
        new.role := 'student';
        new.student_number := split_part(split_part(verified_email, '@', 1), '-', 2);
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_profile_identity() from public, anon, authenticated;
drop trigger if exists protect_profile_identity on public.profiles;
create trigger protect_profile_identity before insert or update on public.profiles
for each row execute function public.protect_profile_identity();

create or replace function public.is_approved_teacher()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;
revoke all on function public.is_approved_teacher() from public, anon;
grant execute on function public.is_approved_teacher() to authenticated;

-- Replace policies together; existing permissive policies could otherwise bypass new ones.
do $$
declare item record; table_name text;
begin
  foreach table_name in array array['profiles','research_records','student_academic_profiles','teacher_shared_files'] loop
    execute format('alter table public.%I enable row level security', table_name);
    for item in select policyname from pg_policies where schemaname = 'public' and tablename = table_name loop
      execute format('drop policy %I on public.%I', item.policyname, table_name);
    end loop;
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end;
$$;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.research_records, public.student_academic_profiles, public.teacher_shared_files to authenticated;
create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy records_owner on public.research_records for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy academic_owner on public.student_academic_profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy shared_read on public.teacher_shared_files for select to authenticated using (
  (teacher_id = (select auth.uid()) and (select public.is_approved_teacher()))
  or lower(student_email) = lower((select auth.jwt()->>'email'))
);
create policy shared_insert_teacher on public.teacher_shared_files for insert to authenticated with check (
  teacher_id = (select auth.uid()) and (select public.is_approved_teacher())
);
create policy shared_update_teacher on public.teacher_shared_files for update to authenticated using (
  teacher_id = (select auth.uid()) and (select public.is_approved_teacher())
) with check (teacher_id = (select auth.uid()) and (select public.is_approved_teacher()));
create policy shared_delete_teacher on public.teacher_shared_files for delete to authenticated using (
  teacher_id = (select auth.uid()) and (select public.is_approved_teacher())
);
create index if not exists research_records_user_created_idx on public.research_records(user_id, created_at desc);
create index if not exists teacher_shared_files_student_email_idx on public.teacher_shared_files(student_email);
create index if not exists teacher_shared_files_teacher_idx on public.teacher_shared_files(teacher_id);

-- One locked row per user: counters survive cold starts and work across server instances.
create table if not exists public.ai_analysis_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  window_count integer not null default 0,
  day_start timestamptz not null,
  day_count integer not null default 0
);
alter table public.ai_analysis_quotas enable row level security;
revoke all on public.ai_analysis_quotas from anon, authenticated;
create or replace function public.consume_ai_analysis_quota()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); stamp timestamptz := now(); quota public.ai_analysis_quotas%rowtype;
  retry_at timestamptz;
begin
  if uid is null or not exists(select 1 from public.profiles where id = uid and role = 'student') then
    raise exception 'Approved student required';
  end if;
  insert into public.ai_analysis_quotas(user_id, window_start, day_start)
    values(uid, stamp, stamp) on conflict do nothing;
  select * into quota from public.ai_analysis_quotas where user_id = uid for update;
  if stamp >= quota.window_start + interval '10 minutes' then
    quota.window_start := stamp; quota.window_count := 0;
  end if;
  if stamp >= quota.day_start + interval '24 hours' then
    quota.day_start := stamp; quota.day_count := 0;
  end if;
  if quota.day_count >= 20 then retry_at := quota.day_start + interval '24 hours';
  elsif quota.window_count >= 5 then retry_at := quota.window_start + interval '10 minutes'; end if;
  if retry_at is not null then
    return jsonb_build_object('allowed', false, 'retry_after', greatest(1, ceil(extract(epoch from retry_at - stamp))::integer));
  end if;
  update public.ai_analysis_quotas set window_start = quota.window_start, window_count = quota.window_count + 1,
    day_start = quota.day_start, day_count = quota.day_count + 1 where user_id = uid;
  return jsonb_build_object('allowed', true);
end;
$$;
revoke all on function public.consume_ai_analysis_quota() from public, anon;
grant execute on function public.consume_ai_analysis_quota() to authenticated;
commit;
