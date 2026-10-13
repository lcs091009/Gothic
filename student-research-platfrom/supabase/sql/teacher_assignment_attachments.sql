-- Additive upgrade for multiple files; existing assignment rows remain valid.
alter table public.teacher_shared_files add column if not exists attachments jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.teacher_shared_files'::regclass and conname='teacher_assignment_attachments_limit') then
    alter table public.teacher_shared_files add constraint teacher_assignment_attachments_limit check (jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=20);
  end if;
end $$;
