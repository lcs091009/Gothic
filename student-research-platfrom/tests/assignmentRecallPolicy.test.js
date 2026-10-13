import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
test("recall policy permits approved owner teacher only and is safe to reapply",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub')::uuid$$;
      create table profiles(id uuid primary key,role text);
      create function is_approved_teacher() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role='teacher')$$;
      create table teacher_shared_files(id uuid primary key,teacher_id uuid);
      alter table teacher_shared_files enable row level security;
      grant usage on schema auth to authenticated;grant select,delete on teacher_shared_files to authenticated;
      create policy fixture_select on teacher_shared_files for select to authenticated using(true);
      insert into profiles values('00000000-0000-4000-8000-000000000001','teacher'),('00000000-0000-4000-8000-000000000002','teacher'),('00000000-0000-4000-8000-000000000003','student');
      insert into teacher_shared_files values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000003');`);
    const sql=await readFile(new URL('../supabase/migrations/20261013233652_teacher_assignment_recall.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    async function recall(n) {await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-${String(n).padStart(12,'0')}',false)`);const result=await db.query('delete from teacher_shared_files returning id');await db.exec('reset role');return result.rows;}
    assert.equal((await recall(2)).length,0);assert.equal((await recall(3)).length,0);assert.equal((await recall(1)).length,1);assert.equal((await recall(1)).length,0);
    assert.equal((await db.query('select * from teacher_shared_files')).rows.length,1);
  }finally{await db.close();}
});
