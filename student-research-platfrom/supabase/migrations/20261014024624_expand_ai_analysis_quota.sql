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
  if quota.window_count >= 200 then retry_at := quota.window_start + interval '10 minutes'; end if;
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
